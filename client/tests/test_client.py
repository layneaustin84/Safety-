"""Unit tests using an httpx MockTransport; no server required."""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from pydantic import HttpUrl, SecretStr, ValidationError

from qwen_client.client import ChatRequest, QwenClient, QwenClientError
from qwen_client.config import SamplingPreset, Settings


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "base_url": HttpUrl("http://llama:8080/v1"),
        "api_key": SecretStr("secret"),
        "model": "qwen3.8-27b-uncensored",
        "timeout_s": 5.0,
        "max_retries": 0,
    }
    base.update(overrides)
    return Settings.model_validate(base)


def _client(handler: httpx.MockTransport) -> QwenClient:
    return QwenClient(_settings(), http_client=httpx.Client(transport=handler))


def _completion_body(content: str, reasoning: str | None = None) -> dict[str, object]:
    message: dict[str, object] = {"role": "assistant", "content": content}
    if reasoning is not None:
        message["reasoning_content"] = reasoning
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 0,
        "model": "qwen3.8-27b-uncensored",
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10},
    }


def test_settings_rejects_base_url_without_v1() -> None:
    with pytest.raises(ValidationError):
        _settings(base_url=HttpUrl("http://llama:8080"))


def test_server_root_strips_v1() -> None:
    assert _settings().server_root == "http://llama:8080"


def test_bearer_placeholder_when_no_key() -> None:
    assert _settings(api_key=SecretStr("")).bearer == "no-key"


def test_health_parses_ok_and_loading() -> None:
    states = iter([(200, {"status": "ok"}), (503, {"status": "loading model"})])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/health"
        assert request.headers["authorization"] == "Bearer secret"
        code, body = next(states)
        return httpx.Response(code, json=body)

    with _client(httpx.MockTransport(handler)) as client:
        assert client.health().status == "ok"
        assert client.health().status == "loading model"


def test_health_raises_on_unexpected_status() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with _client(httpx.MockTransport(handler)) as client, pytest.raises(QwenClientError):
        client.health()


def test_chat_sends_preset_and_thinking_flag() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/chat/completions"
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=_completion_body("hi", reasoning="because"))

    with _client(httpx.MockTransport(handler)) as client:
        result = client.chat(ChatRequest(prompt="hello", preset=SamplingPreset.THINKING))

    assert result.content == "hi"
    assert result.reasoning == "because"
    assert result.finish_reason == "stop"
    assert (result.prompt_tokens, result.completion_tokens) == (7, 3)
    assert captured["model"] == "qwen3.8-27b-uncensored"
    assert captured["temperature"] == 0.6
    assert captured["top_p"] == 0.95
    assert captured["top_k"] == 20
    assert captured["chat_template_kwargs"] == {"enable_thinking": True}
    assert captured["messages"] == [{"role": "user", "content": "hello"}]


def test_chat_explicit_sampling_overrides_preset() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=_completion_body("x"))

    req = ChatRequest(prompt="p", system="sys", temperature=0.1, top_p=0.5, top_k=5, seed=42)
    with _client(httpx.MockTransport(handler)) as client:
        result = client.chat(req)

    assert result.reasoning is None
    assert captured["temperature"] == 0.1
    assert captured["top_p"] == 0.5
    assert captured["top_k"] == 5
    assert captured["seed"] == 42
    assert captured["chat_template_kwargs"] == {"enable_thinking": False}
    assert captured["messages"][0] == {"role": "system", "content": "sys"}  # type: ignore[index]


def test_chat_image_is_inlined_as_data_url(tmp_path: Path) -> None:
    png = tmp_path / "pic.png"
    png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=_completion_body("a cat"))

    with _client(httpx.MockTransport(handler)) as client:
        client.chat(ChatRequest(prompt="describe", images=(png,)))

    user = captured["messages"][0]  # type: ignore[index]
    parts = user["content"]
    assert parts[0] == {"type": "text", "text": "describe"}
    assert parts[1]["type"] == "image_url"
    assert parts[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_chat_rejects_unsupported_image(tmp_path: Path) -> None:
    gif = tmp_path / "pic.gif"
    gif.write_bytes(b"GIF89a")

    def handler(_: httpx.Request) -> httpx.Response:  # pragma: no cover - never reached
        raise AssertionError("request should not be sent")

    with _client(httpx.MockTransport(handler)) as client, pytest.raises(QwenClientError):
        client.chat(ChatRequest(prompt="x", images=(gif,)))


def test_chat_wraps_http_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "invalid api key"}})

    with _client(httpx.MockTransport(handler)) as client, pytest.raises(QwenClientError):
        client.chat(ChatRequest(prompt="x"))


def test_stream_yields_content_deltas_only() -> None:
    def sse(obj: dict[str, object]) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def chunk(**delta: str) -> dict[str, object]:
        return {
            "id": "c",
            "object": "chat.completion.chunk",
            "created": 0,
            "model": "m",
            "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
        }

    body = (
        sse(chunk(reasoning_content="thinking..."))
        + sse(chunk(content="Hel"))
        + sse(chunk(content="lo"))
        + "data: [DONE]\n\n"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["stream"] is True
        return httpx.Response(200, content=body, headers={"content-type": "text/event-stream"})

    with _client(httpx.MockTransport(handler)) as client:
        assert "".join(client.stream(ChatRequest(prompt="x"))) == "Hello"


def test_models_lists_ids() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/models"
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {
                        "id": "qwen3.8-27b-uncensored",
                        "object": "model",
                        "created": 0,
                        "owned_by": "llamacpp",
                    }
                ],
            },
        )

    with _client(httpx.MockTransport(handler)) as client:
        assert client.models() == ["qwen3.8-27b-uncensored"]
