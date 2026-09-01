"""Thin, typed wrapper over the openai SDK targeting llama-server."""

from __future__ import annotations

import base64
import mimetypes
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import httpx
from openai import APIConnectionError, APIStatusError, OpenAI
from openai.types.chat import (
    ChatCompletionContentPartImageParam,
    ChatCompletionContentPartTextParam,
    ChatCompletionMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)
from pydantic import BaseModel, ConfigDict, Field

from qwen_client.config import SamplingPreset, Settings

_IMAGE_MIME_ALLOWLIST: frozenset[str] = frozenset({"image/png", "image/jpeg", "image/webp"})
_MAX_IMAGE_BYTES = 20 * 1024 * 1024


class ServerHealth(BaseModel):
    """Shape of llama-server GET /health."""

    model_config = ConfigDict(extra="ignore")

    status: Literal["ok", "loading model", "error", "no slot available"] | str


class QwenClientError(RuntimeError):
    """Raised for transport, HTTP, or protocol failures against llama-server."""


@dataclass(frozen=True, slots=True)
class ChatResult:
    """Non-streaming completion result."""

    content: str
    reasoning: str | None
    finish_reason: str | None
    prompt_tokens: int
    completion_tokens: int
    raw: dict[str, Any] = field(repr=False)


class ChatRequest(BaseModel):
    """Validated inputs for one chat turn."""

    model_config = ConfigDict(frozen=True)

    prompt: str = Field(min_length=1)
    system: str | None = None
    images: tuple[Path, ...] = ()
    preset: SamplingPreset = SamplingPreset.NON_THINKING
    max_tokens: int = Field(default=2048, ge=1, le=262144)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, gt=0.0, le=1.0)
    top_k: int | None = Field(default=None, ge=0)
    seed: int | None = None


def _encode_image(path: Path) -> ChatCompletionContentPartImageParam:
    if not path.is_file():
        msg = f"image not found: {path}"
        raise QwenClientError(msg)
    mime, _ = mimetypes.guess_type(path.name)
    if mime not in _IMAGE_MIME_ALLOWLIST:
        msg = f"unsupported image type {mime!r} for {path}; use png/jpeg/webp"
        raise QwenClientError(msg)
    data = path.read_bytes()
    if len(data) > _MAX_IMAGE_BYTES:
        msg = f"image {path} exceeds {_MAX_IMAGE_BYTES} bytes"
        raise QwenClientError(msg)
    b64 = base64.b64encode(data).decode("ascii")
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}


def _build_messages(req: ChatRequest) -> list[ChatCompletionMessageParam]:
    messages: list[ChatCompletionMessageParam] = []
    if req.system:
        system_msg: ChatCompletionSystemMessageParam = {"role": "system", "content": req.system}
        messages.append(system_msg)

    if req.images:
        text_part: ChatCompletionContentPartTextParam = {"type": "text", "text": req.prompt}
        parts: list[ChatCompletionContentPartTextParam | ChatCompletionContentPartImageParam] = [
            text_part,
            *(_encode_image(p) for p in req.images),
        ]
        user_msg: ChatCompletionUserMessageParam = {"role": "user", "content": parts}
    else:
        user_msg = {"role": "user", "content": req.prompt}
    messages.append(user_msg)
    return messages


class QwenClient:
    """Synchronous client. One instance per process; the underlying httpx pool is reused."""

    def __init__(
        self, settings: Settings | None = None, *, http_client: httpx.Client | None = None
    ) -> None:
        self.settings = settings or Settings()
        self._http = http_client or httpx.Client(timeout=self.settings.timeout_s)
        self._openai = OpenAI(
            base_url=str(self.settings.base_url),
            api_key=self.settings.bearer,
            timeout=self.settings.timeout_s,
            max_retries=self.settings.max_retries,
            http_client=self._http,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> QwenClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ---- llama-server native endpoints -------------------------------------------------

    def health(self) -> ServerHealth:
        url = f"{self.settings.server_root}/health"
        try:
            resp = self._http.get(url, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            msg = f"health check failed: {exc}"
            raise QwenClientError(msg) from exc
        # llama-server returns 503 with a JSON body while loading; that is still a valid answer.
        if resp.status_code not in (200, 503):
            msg = f"health returned HTTP {resp.status_code}: {resp.text[:200]}"
            raise QwenClientError(msg)
        return ServerHealth.model_validate(resp.json())

    def models(self) -> list[str]:
        try:
            page = self._openai.models.list()
        except (APIConnectionError, APIStatusError) as exc:
            msg = f"list models failed: {exc}"
            raise QwenClientError(msg) from exc
        return [m.id for m in page.data]

    # ---- chat ---------------------------------------------------------------------------

    def chat(self, req: ChatRequest) -> ChatResult:
        try:
            completion = self._openai.chat.completions.create(
                stream=False, **self._completion_kwargs(req)
            )
        except (APIConnectionError, APIStatusError) as exc:
            msg = f"chat completion failed: {exc}"
            raise QwenClientError(msg) from exc

        if not completion.choices:
            msg = "server returned no choices"
            raise QwenClientError(msg)
        choice = completion.choices[0]
        raw = completion.model_dump()
        # llama-server emits reasoning under `reasoning_content` when --reasoning-format is set.
        reasoning = raw["choices"][0]["message"].get("reasoning_content")
        usage = completion.usage
        return ChatResult(
            content=choice.message.content or "",
            reasoning=reasoning if isinstance(reasoning, str) and reasoning else None,
            finish_reason=choice.finish_reason,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            raw=raw,
        )

    def stream(self, req: ChatRequest) -> Iterator[str]:
        """Yield content deltas as they arrive. Reasoning deltas are skipped."""
        try:
            with self._openai.chat.completions.create(
                stream=True, **self._completion_kwargs(req)
            ) as events:
                for chunk in events:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
        except (APIConnectionError, APIStatusError) as exc:
            msg = f"streaming chat failed: {exc}"
            raise QwenClientError(msg) from exc

    # ---- internals ----------------------------------------------------------------------

    def _auth_headers(self) -> dict[str, str]:
        key = self.settings.api_key.get_secret_value()
        return {"Authorization": f"Bearer {key}"} if key else {}

    def _completion_kwargs(self, req: ChatRequest) -> dict[str, Any]:
        preset = req.preset
        extra_body: dict[str, Any] = {
            # Both are llama-server extensions to the OpenAI schema.
            "top_k": preset.top_k if req.top_k is None else req.top_k,
            "chat_template_kwargs": {"enable_thinking": preset.enable_thinking},
        }
        kwargs: dict[str, Any] = {
            "model": self.settings.model,
            "messages": _build_messages(req),
            "max_tokens": req.max_tokens,
            "temperature": preset.temperature if req.temperature is None else req.temperature,
            "top_p": preset.top_p if req.top_p is None else req.top_p,
            "extra_body": extra_body,
        }
        if req.seed is not None:
            kwargs["seed"] = req.seed
        return kwargs


def image_paths(values: Sequence[str]) -> tuple[Path, ...]:
    """Normalise CLI image arguments to absolute paths."""
    return tuple(Path(v).expanduser().resolve() for v in values)
