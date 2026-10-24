#!/bin/sh
# Voz PROVISÓRIA do anúncio (voz "Joana", PT-PT, do macOS) → public/audio/voz/*.wav
# Para a versão final, substituir estes ficheiros pela locução gravada (mesmos nomes).
set -e
mkdir -p public/audio/voz
cd public/audio/voz
while IFS='|' read -r id rate text; do
  say -v Joana -r "$rate" -o "$id.aiff" "$text"
  afconvert -f WAVE -d LEI16@44100 "$id.aiff" "$id.wav"
  rm "$id.aiff"
  echo "✓ $id"
done <<'LINHAS'
full|180|Sábado. Duas da tarde. Casa cheia.
chaos|190|Os clientes querem pedir… e a equipa não chega a todo o lado.
turn|180|E se ninguém tivesse de esperar para pedir?
tap|185|O cliente aproxima o telemóvel, ou lê o QR Code…
order|180|escolhe, e pede. Em segundos.
send|185|O pedido segue para o sistema do restaurante.
calm|170|Menos espera. Mais serviço.
end|180|O empregado que não sabias que precisavas.
LINHAS
