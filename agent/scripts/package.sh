#!/usr/bin/env bash
# Builds the AgentCore Runtime code package: the agent source plus its
# dependencies for linux/arm64 (the Runtime runs on Graviton).
# Usage: agent/scripts/package.sh <output dir>
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?output directory}"

rm -rf "$OUT"
mkdir -p "$OUT"
cd "$AGENT_DIR"
uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o "$OUT/requirements.txt" > /dev/null
uv pip install --quiet --python-platform aarch64-manylinux2014 --python-version 3.12 \
  --only-binary=:all: --target "$OUT" -r "$OUT/requirements.txt"
rm "$OUT/requirements.txt"
cp -r domain brain server voice main.py "$OUT/"
# FixtureToolClient answers resolve_titles and similar until #40 ships.
mkdir -p "$OUT/fixtures"
cp -r ../packages/domain/fixtures/tools "$OUT/fixtures/"
find "$OUT" -name "__pycache__" -type d -prune -exec rm -rf {} +
