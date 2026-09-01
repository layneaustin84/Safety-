"""`qwen` command line entry point."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

from pydantic import ValidationError

from qwen_client.client import ChatRequest, QwenClient, QwenClientError, image_paths
from qwen_client.config import SamplingPreset, Settings


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="qwen",
        description="Talk to Qwen3.8-27B-Uncensored via llama-server's OpenAI API.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Show llama-server /health status.")
    sub.add_parser("models", help="List model ids the server advertises.")

    chat = sub.add_parser("chat", help="Single-turn chat completion.")
    chat.add_argument("prompt", help="User message.")
    chat.add_argument("--system", default=None, help="System prompt.")
    chat.add_argument(
        "--image",
        action="append",
        default=[],
        metavar="PATH",
        help="Attach an image (png/jpeg/webp). Repeatable. Requires --mmproj on the server.",
    )
    chat.add_argument(
        "--think",
        action="store_true",
        help="Enable thinking mode and its sampling preset (temp 0.6, top_p 0.95).",
    )
    chat.add_argument("--max-tokens", type=int, default=2048)
    chat.add_argument("--temperature", type=float, default=None)
    chat.add_argument("--top-p", type=float, default=None)
    chat.add_argument("--top-k", type=int, default=None)
    chat.add_argument("--seed", type=int, default=None)
    chat.add_argument("--no-stream", action="store_true", help="Wait for the full response.")
    chat.add_argument(
        "--json", action="store_true", help="Emit the full response as JSON (implies --no-stream)."
    )
    return parser


def _cmd_health(client: QwenClient) -> int:
    health = client.health()
    print(health.status)
    return 0 if health.status == "ok" else 1


def _cmd_models(client: QwenClient) -> int:
    for model_id in client.models():
        print(model_id)
    return 0


def _cmd_chat(client: QwenClient, ns: argparse.Namespace) -> int:
    req = ChatRequest(
        prompt=ns.prompt,
        system=ns.system,
        images=image_paths(ns.image),
        preset=SamplingPreset.THINKING if ns.think else SamplingPreset.NON_THINKING,
        max_tokens=ns.max_tokens,
        temperature=ns.temperature,
        top_p=ns.top_p,
        top_k=ns.top_k,
        seed=ns.seed,
    )

    if ns.json:
        result = client.chat(req)
        json.dump(result.raw, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return 0

    if ns.no_stream:
        result = client.chat(req)
        if result.reasoning:
            print(f"[reasoning]\n{result.reasoning}\n[/reasoning]\n", file=sys.stderr)
        print(result.content)
        print(
            f"\n[{result.finish_reason}] prompt={result.prompt_tokens} "
            f"completion={result.completion_tokens}",
            file=sys.stderr,
        )
        return 0

    for delta in client.stream(req):
        sys.stdout.write(delta)
        sys.stdout.flush()
    sys.stdout.write("\n")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    ns = _build_parser().parse_args(argv)
    try:
        settings = Settings()
    except ValidationError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2

    try:
        with QwenClient(settings) as client:
            if ns.command == "health":
                return _cmd_health(client)
            if ns.command == "models":
                return _cmd_models(client)
            return _cmd_chat(client, ns)
    except (QwenClientError, ValidationError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
