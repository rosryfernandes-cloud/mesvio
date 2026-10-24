#!/bin/sh
# Exporta as campanhas v2 e normaliza o volume para as redes (−14 LUFS, pico máximo −1,5 dB).
#   sh scripts/exportar-campanhas.sh                         → as 4 versões finais (voz Carlos)
#   sh scripts/exportar-campanhas.sh praia-maria-9x16 …      → só as indicadas
# Resultado: out/campanhas/MESVIO-<campanha>-<voz>-<formato>.mp4
set -e
cd "$(dirname "$0")/.."
PORT=${PORT:-3317}
IDS=${*:-"praia-carlos-9x16 praia-carlos-16x9 restaurante-carlos-9x16 restaurante-carlos-16x9"}
mkdir -p out/campanhas/bruto
for id in $IDS; do
  echo "▶ $id"
  npx remotion render "Campanha-$id" "out/campanhas/bruto/$id.mp4" --port="$PORT" --log=error
  npx remotion ffmpeg -y -loglevel error -i "out/campanhas/bruto/$id.mp4" -c:v copy \
    -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k -movflags +faststart \
    "out/campanhas/MESVIO-$id.mp4"
  echo "✓ out/campanhas/MESVIO-$id.mp4"
done
