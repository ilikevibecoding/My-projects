#!/usr/bin/env bash
# Downloads public Pokémon assets (Gen 1, #1-151) from the PokeAPI GitHub repos.
# Run once from the repo root:  bash pokemon/tools/fetch_assets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPRITES="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"
CRIES="https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest"

mkdir -p "$ROOT/assets/pokemon/front" "$ROOT/assets/pokemon/back" \
         "$ROOT/assets/pokemon/icons" "$ROOT/assets/cries"

fetch() {
  local url="$1" out="$2"
  if [ -s "$out" ]; then return 0; fi
  for attempt in 1 2 3; do
    if curl -fsSL --retry 2 -o "$out" "$url"; then return 0; fi
    sleep $((attempt * 2))
  done
  echo "FAILED: $url" >&2
  return 1
}

for i in $(seq 1 151); do
  fetch "$SPRITES/$i.png"                                   "$ROOT/assets/pokemon/front/$i.png" &
  fetch "$SPRITES/back/$i.png"                              "$ROOT/assets/pokemon/back/$i.png" &
  fetch "$SPRITES/versions/generation-viii/icons/$i.png"    "$ROOT/assets/pokemon/icons/$i.png" &
  fetch "$CRIES/$i.ogg"                                     "$ROOT/assets/cries/$i.ogg" &
  # limit parallelism
  if [ $((i % 8)) -eq 0 ]; then wait; fi
done
wait

echo "front: $(ls "$ROOT/assets/pokemon/front" | wc -l) files"
echo "back:  $(ls "$ROOT/assets/pokemon/back" | wc -l) files"
echo "icons: $(ls "$ROOT/assets/pokemon/icons" | wc -l) files"
echo "cries: $(ls "$ROOT/assets/cries" | wc -l) files"
