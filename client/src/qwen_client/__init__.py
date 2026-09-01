"""OpenAI-compatible client for Qwen3.8-27B-Uncensored served by llama.cpp."""

from qwen_client.client import ChatResult, QwenClient, ServerHealth
from qwen_client.config import SamplingPreset, Settings

__all__ = ["ChatResult", "QwenClient", "SamplingPreset", "ServerHealth", "Settings"]
