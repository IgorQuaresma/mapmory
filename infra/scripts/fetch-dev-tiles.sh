#!/usr/bin/env bash
# Extracts a small regional PMTiles archive (Paris, Münster, Lisbon, Manhattan; z0–15, ~80 MB) from the latest
# Protomaps planet build for local development and CI. Production uses the full planet build; see docs/ops.md.
set -euo pipefail
INFRA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$INFRA/data/tiles"
mkdir -p "$OUT"
cp "$INFRA/scripts/dev-regions.geojson" "$OUT/regions.geojson"
if [[ -s "$OUT/dev.pmtiles" && "${FORCE:-0}" != "1" ]]; then
  echo "dev.pmtiles already present (FORCE=1 to refresh)"
  exit 0
fi
BUILD="${PROTOMAPS_BUILD:-$(curl -fsS https://build-metadata.protomaps.dev/builds.json | python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"])')}"
echo "Extracting dev regions from https://build.protomaps.com/${BUILD}"
docker run --rm -v "$OUT":/data protomaps/go-pmtiles extract "https://build.protomaps.com/${BUILD}" /data/dev.pmtiles \
  --region=/data/regions.geojson --maxzoom=15
echo "Done: $OUT/dev.pmtiles"
