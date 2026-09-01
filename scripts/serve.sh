#!/usr/bin/env bash
# Run llama-server on the host (no Docker). Requires a llama.cpp build that
# includes MTP speculative decoding (PR #22673 or later); older builds load the
# file but silently ignore the MTP tensors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck disable=SC1091
[[ -f "$ROOT_DIR/.env" ]] && set -a && source "$ROOT_DIR/.env" && set +a

MODELS_DIR="${MODELS_DIR:-$ROOT_DIR/models}"
MODEL_FILE="${MODEL_FILE:-Qwen3.8-27B-Uncensored-Q4_K_M.gguf}"
MMPROJ_FILE="${MMPROJ_FILE:-}"
LLAMA_SERVER_BIN="${LLAMA_SERVER_BIN:-llama-server}"

MODEL_PATH="$MODELS_DIR/$MODEL_FILE"
[[ -s "$MODEL_PATH" ]] || { echo "error: $MODEL_PATH not found. Run scripts/download-model.sh" >&2; exit 1; }

args=(
  --model "$MODEL_PATH"
  --alias "${LLAMA_ALIAS:-qwen3.8-27b-uncensored}"
  --host "${LLAMA_HOST:-127.0.0.1}"
  --port "${LLAMA_PORT:-8080}"
  --ctx-size "${LLAMA_CTX_SIZE:-8192}"
  --n-gpu-layers "${LLAMA_N_GPU_LAYERS:-99}"
  --parallel "${LLAMA_PARALLEL:-1}"
  --flash-attn on
  --jinja
  --reasoning-format deepseek
)

spec_type="${LLAMA_SPEC_TYPE:-draft-mtp}"
if [[ "$spec_type" != "none" ]]; then
  args+=(--spec-type "$spec_type" --spec-draft-n-max "${LLAMA_SPEC_DRAFT_N_MAX:-2}")
fi

if [[ -n "$MMPROJ_FILE" ]]; then
  MMPROJ_PATH="$MODELS_DIR/$MMPROJ_FILE"
  [[ -s "$MMPROJ_PATH" ]] || { echo "error: $MMPROJ_PATH not found" >&2; exit 1; }
  args+=(--mmproj "$MMPROJ_PATH")
fi

[[ -n "${LLAMA_API_KEY:-}" ]] && args+=(--api-key "$LLAMA_API_KEY")

exec "$LLAMA_SERVER_BIN" "${args[@]}" "$@"
