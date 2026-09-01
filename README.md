# Qwen3.8-27B-Uncensored inference scaffold

Self-hosted OpenAI-compatible serving for
[`orcarouter/Qwen3.8-27B-Uncensored`](https://huggingface.co/orcarouter/Qwen3.8-27B-Uncensored)
via [llama.cpp](https://github.com/ggml-org/llama.cpp), plus a typed Python client and CLI.

The original bf16 repo is gated. This scaffold targets the ungated GGUF re-quant
[`JonathanColetti/Qwen3.8-27B-Uncensored-GGUF`](https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF),
which retains the multi-token-prediction (MTP) draft head and ships a vision projector.

> This is an abliterated model: refusals on harmful prompts drop from 98/100 to 12/100 on the
> quant author's held-out set. It is intended for red-team and research use under the
> Qwen Apache-2.0 licence and acceptable-use policy. Do not expose the server to untrusted
> networks without `LLAMA_API_KEY` set.

## Layout

| Path | Purpose |
|---|---|
| `.env.example` | All tunables. Copy to `.env`. |
| `docker-compose.yml` | `download` (one-shot), `llama-server` (CUDA), `client` services. |
| `scripts/download-model.sh` | `hf download` of the chosen quant + mmproj into `models/`. |
| `scripts/serve.sh` | Host-native `llama-server` launcher with the same flags as compose. |
| `client/` | `qwen-client` package: `QwenClient` wrapper over the openai SDK and `qwen` CLI. |

## Hardware and quant selection

Weights only; add KV cache (~0.5 GB per 8k ctx at Q4_K_M with flash-attn) and the 0.9 GB
mmproj if vision is enabled.

| `MODEL_FILE` | Size | Fits | Notes |
|---|---|---|---|
| `Qwen3.8-27B-Uncensored-IQ2_M.gguf` | 10.6 GB | 12-16 GB | PPL +0.70 vs f16. Refusal boundary uncharacterised at 2-bit. |
| `Qwen3.8-27B-Uncensored-IQ4_XS.gguf` | 15.3 GB | 16-24 GB | Smallest quant statistically indistinguishable from f16. |
| `Qwen3.8-27B-Uncensored-Q4_K_M.gguf` | 16.8 GB | 24 GB | **Default.** |
| `Qwen3.8-27B-Uncensored-Q6_K.gguf` | 22.4 GB | 32 GB+ | Quant author recommends Q6_K/Q8_0 for behaviour evaluation. |
| `Qwen3.8-27B-Uncensored-Q8_0.gguf` | 29.0 GB | 48 GB+ | |

Every fused file above carries the MTP head inline. `noMTP-*` twins plus `draft-Q8_0.gguf`
exist for runtimes that want an explicit `--model-draft`; `scripts/serve.sh` does not use
that path.

## Quick start (Docker, NVIDIA)

Requires Docker Compose v2 and the NVIDIA Container Toolkit.

```bash
cp .env.example .env            # edit MODEL_FILE / LLAMA_API_KEY as needed
docker compose --profile download run --rm download
docker compose up -d llama-server
docker compose logs -f llama-server   # wait for "server is listening"
docker compose run --rm client health
docker compose run --rm client chat "Summarise the Monty Hall problem in two sentences."
```

For CPU or non-NVIDIA GPUs change the `llama-server` image tag (`:server`, `:server-vulkan`,
`:server-rocm`) and remove the `deploy.resources` block.

## Quick start (host-native)

Requires a `llama-server` binary built from a commit that includes MTP speculative decoding
(llama.cpp PR #22673). Older builds load the file and silently ignore the MTP tensors.

```bash
cp .env.example .env
pip install -U huggingface_hub
scripts/download-model.sh
scripts/serve.sh                # extra args are passed through to llama-server

cd client
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
qwen health
qwen chat "hello"
```

## Client usage

CLI:

```bash
qwen health                                    # prints ok | loading model | ...
qwen models
qwen chat "Explain SIMD." --system "Be terse."
qwen chat "Prove sqrt(2) is irrational." --think          # thinking mode + its sampling preset
qwen chat "What is in this image?" --image ./photo.jpg    # needs MMPROJ_FILE on the server
qwen chat "hi" --no-stream --json                          # raw OpenAI-schema JSON
```

Python:

```python
from qwen_client import QwenClient, SamplingPreset
from qwen_client.client import ChatRequest

with QwenClient() as client:              # reads QWEN_* env / .env
    result = client.chat(ChatRequest(prompt="hello", preset=SamplingPreset.THINKING))
    print(result.reasoning, result.content, result.completion_tokens)

    for delta in client.stream(ChatRequest(prompt="stream me")):
        print(delta, end="", flush=True)
```

Any OpenAI SDK works directly against `http://localhost:8080/v1`; the client only adds
validated settings, the Qwen3 sampling presets, the `enable_thinking` template switch,
image inlining, and the `/health` probe.

### Thinking mode

The chat template opens a `<think>` block by default. `--think` (or
`SamplingPreset.THINKING`) sends `chat_template_kwargs.enable_thinking=true` and switches to
temp 0.6 / top_p 0.95 / top_k 20 as the Qwen3 model card recommends. Non-thinking uses
temp 0.7 / top_p 0.8 / top_k 20. Explicit `--temperature` / `--top-p` / `--top-k` override the
preset. `--reasoning-format deepseek` on the server splits the trace into
`reasoning_content`, which the client surfaces as `ChatResult.reasoning`.

Refusal figures on the model card were measured with thinking **disabled**; behaviour with
thinking on is uncharacterised.

### Speculative decoding

`LLAMA_SPEC_TYPE=draft-mtp` with `LLAMA_SPEC_DRAFT_N_MAX=2` is the default. The quant
author's sweep shows n_max 1-2 yields 1.1-1.3x on prose/chat/code and n_max >= 3 falls
below baseline on most prompts, so sweep on your hardware before raising it. Set
`LLAMA_SPEC_TYPE=none` to disable.

## Development

```bash
cd client
ruff check . && ruff format --check .
mypy
pytest
```

Tests use `httpx.MockTransport`; no model or GPU is needed.

## Licence

Scaffold code: Apache-2.0. Model weights inherit Apache-2.0 from `Qwen/Qwen3.8-27B`; the
Qwen acceptable-use policy applies to the derivative.
