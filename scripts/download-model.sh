#!/usr/bin/env bash
# Download the GGUF weights (and optional vision projector) into $MODELS_DIR.
# Idempotent: hf download skips files already present with matching size.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# shellcheck disable=SC1091
[[ -f "$ROOT_DIR/.env" ]] && set -a && source "$ROOT_DIR/.env" && set +a

HF_REPO="${HF_REPO:-JonathanColetti/Qwen3.8-27B-Uncensored-GGUF}"
MODEL_FILE="${MODEL_FILE:-Qwen3.8-27B-Uncensored-Q4_K_M.gguf}"
MMPROJ_FILE="${MMPROJ_FILE:-}"
MODELS_DIR="${MODELS_DIR:-$ROOT_DIR/models}"

if ! command -v hf >/dev/null 2>&1; then
  echo "error: 'hf' CLI not found. Install with: pip install -U huggingface_hub" >&2
  exit 1
fi

mkdir -p "$MODELS_DIR"

files=("$MODEL_FILE")
[[ -n "$MMPROJ_FILE" ]] && files+=("$MMPROJ_FILE")

echo "Downloading ${files[*]} from $HF_REPO -> $MODELS_DIR"
hf download "$HF_REPO" "${files[@]}" --local-dir "$MODELS_DIR"

for f in "${files[@]}"; do
  [[ -s "$MODELS_DIR/$f" ]] || { echo "error: $MODELS_DIR/$f missing after download" >&2; exit 1; }
done
echo "OK"
