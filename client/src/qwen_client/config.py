"""Runtime configuration, loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, HttpUrl, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class SamplingPreset(StrEnum):
    """Qwen3-family recommended sampling profiles.

    Values follow the Qwen3 model card: thinking mode wants a lower temperature and
    higher top_p to keep long reasoning traces coherent; non-thinking mode tolerates a
    slightly hotter distribution. Greedy decoding is discouraged for thinking mode because
    it induces repetition loops.
    """

    THINKING = "thinking"
    NON_THINKING = "non_thinking"

    @property
    def temperature(self) -> float:
        return 0.6 if self is SamplingPreset.THINKING else 0.7

    @property
    def top_p(self) -> float:
        return 0.95 if self is SamplingPreset.THINKING else 0.8

    @property
    def top_k(self) -> int:
        return 20

    @property
    def enable_thinking(self) -> bool:
        return self is SamplingPreset.THINKING


class Settings(BaseSettings):
    """Connection settings. Every field maps to a QWEN_* environment variable."""

    model_config = SettingsConfigDict(
        env_prefix="QWEN_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    base_url: HttpUrl = Field(
        default=HttpUrl("http://localhost:8080/v1"),
        description="llama-server OpenAI-compatible root, including the /v1 suffix.",
    )
    api_key: SecretStr = Field(
        default=SecretStr(""),
        description="Bearer token if llama-server was started with --api-key.",
    )
    model: str = Field(
        default="qwen3.8-27b-uncensored",
        min_length=1,
        description="Model id; must match llama-server --alias.",
    )
    timeout_s: float = Field(
        default=300.0,
        gt=0,
        description="Per-request timeout. 27B at Q4 on a single GPU can take minutes.",
    )
    max_retries: int = Field(default=2, ge=0, le=10)

    @field_validator("base_url")
    @classmethod
    def _require_v1_suffix(cls, value: HttpUrl) -> HttpUrl:
        path = (value.path or "").rstrip("/")
        if not path.endswith("/v1"):
            msg = f"base_url must end with /v1, got {value}"
            raise ValueError(msg)
        return value

    @property
    def server_root(self) -> str:
        """Base URL with /v1 stripped, for llama-server native endpoints like /health."""
        url = str(self.base_url).rstrip("/")
        return url[: -len("/v1")]

    @property
    def bearer(self) -> str:
        """Token to send. llama-server ignores Authorization when no --api-key is set, and
        the openai SDK refuses an empty key, so substitute a placeholder."""
        raw = self.api_key.get_secret_value()
        return raw if raw else "no-key"
