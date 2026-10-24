# MESVIO — Campanhas v2 (A · Restaurantes, B · Bares de praia)

Nova versão dos anúncios de 30 s. Os ficheiros originais (Maria e Carlos, 16:9 e 9:16) ficam como estavam. Código em `src/v2/`; guião, textos e tempos em `src/v2/campaigns.ts`.

## O que mudou em relação aos anúncios originais

| Antes | Agora |
|---|---|
| Abria com "Sábado. Duas da tarde. Casa cheia." — situação, sem pergunta. | Abre com uma **pergunta direta ao dono** ("Tens um bar de praia e a equipa não chega a todos os clientes?") e com o cenário real do problema: clientes a chamar e o funcionário a atravessar o espaço todo a pé, com o rasto dos passos a ficar na areia. |
| O caos era mostrado (mãos no ar, relógio), mas não se via *porquê*. | A cena do problema mostra o **serviço tradicional passo a passo** — Ir ao cliente › Anotar › Voltar ao bar › Preparar › Entregar — com o passo atual aceso, sincronizado com o que o funcionário está a fazer. |
| "Menos espera. Mais serviço." sem mostrar a diferença. | **Antes/depois com a mesma faixa:** com a MESVIO, os três primeiros passos são riscados e ficam só "Preparar › Entregar"; o funcionário vai direto do bar à Cama 12. O benefício (menos tempo a recolher pedidos, a equipa concentrada nas entregas) vê-se sem números inventados. |
| O pedido seguia para o "Sistema do restaurante" com o selo "POS ligado". | O pedido aparece no **painel MESVIO** ("Painel do bar" / "Painel do restaurante", selo "● Ao vivo"), que já existe. **Sem POS nem pagamentos** apresentados como concluídos. |
| O cliente pedia hambúrguer e mojito. | Pede **uma bebida** e confirma — o fluxo pedido no briefing, mais simples de seguir. |
| Legendas fixas por cena. | **Legendas sincronizadas palavra a palavra** com a voz (tempos da ElevenLabs): a palavra dita fica a menta, aos blocos curtos no 9:16, sem palavras soltas. |
| Corte seco entre cenas. | Entradas suaves (opacidade + escala), passagens de som discretas, viragem com o ponto menta a varrer para o verde MESVIO. |
| Fecho com logótipo pequeno e "Pede uma demonstração". | **Logótipo maior**, desenhado traço a traço com o ponto menta a "saltar"; slogan; linha da campanha ("Digitaliza os pedidos do teu bar de praia." / "…do teu restaurante."); botão **"Solicita uma demonstração"**; "Menos espera. Mais serviço." A voz diz o slogan e a chamada à ação. |
| Fundo musical de acordes. | Música de fundo nova (sintetizada, sem direitos de terceiros): tensa e contida até à viragem, leve e otimista depois, **baixa automaticamente por baixo da voz**. Ambiente de mar (praia) ou de sala (restaurante). |
| Volume baixo para redes. | Volume **normalizado a −14 LUFS** (padrão de TikTok/Reels/YouTube), pico máximo −1,5 dB. |

## Guião — Campanha B · Bares de praia (prioritária: Costa da Caparica, Fonte da Telha)

| Cena | Imagem | Locução / legenda |
|---|---|---|
| Gancho (0–3,7 s) | Praia vista de cima: mar, filas de camas com chapéu, o bar ao fundo. Os clientes levantam a mão um a um; o funcionário atravessa a praia a pé e deixa pegadas. | "Tens um bar de praia e a equipa não chega a todos os clientes?" |
| Problema (3,7–8,3 s) | Faixa "Serviço tradicional": Ir ao cliente › Anotar › Voltar ao bar › Preparar › Entregar, acesa ao ritmo do funcionário; o rasto na areia acumula-se; o calor sobe nas margens. | "Camas longe do bar, areia, calor… cada pedido é uma ida e volta." |
| Viragem (8,3–11,4 s) | A imagem congela a cinzento; o ponto menta varre para o verde MESVIO; o logótipo desenha-se. | "Com a MESVIO, o pedido vem até ti." |
| Toque (11,4–15,1 s) | Autocolante NFC/QR da Cama 12; o telemóvel aproxima-se, ondas menta, a ementa abre. | "Aproxima o telemóvel do NFC, ou lê o QR Code." |
| Pedido (15,1–18,5 s) | Ementa MESVIO real: toca no "Mojito de maracujá", "Ver pedido", "Enviar pedido para a cozinha". | "Escolhe uma bebida e confirma o pedido." |
| Painel (18,5–21,2 s) | O ponto menta viaja até ao "Painel do bar": "#014 Cama 12 · 1× Mojito de maracujá". No telemóvel: "✓ Confirmado". | "O pedido aparece logo no painel do bar." |
| Entrega (21,2–25,5 s) | Faixa "Com a MESVIO": os três primeiros passos riscados; o funcionário leva a bandeja direto à Cama 12 ("✓ Entregue"); as outras camas já pediram (✓). | "E a equipa deixa de recolher pedidos, para se concentrar nas entregas." |
| Assinatura (25,5–30,7 s) | Logótipo grande, slogan, "Digitaliza os pedidos do teu bar de praia.", botão "Solicita uma demonstração", "Menos espera. Mais serviço." | "MESVIO. O empregado que não sabias que precisavas. Solicita uma demonstração." |

(Tempos da versão com a voz Carlos; com a Maria cada cena ajusta-se à fala.)

## Guião — Campanha A · Restaurantes

Mesma estrutura, numa sala vista de cima (mesas, cozinha, janelas):
- Gancho: "Tens um restaurante e a equipa não consegue atender todas as mesas a tempo?"
- Problema: "Hora de ponta, mesas a chamar… cada pedido é mais uma volta à sala." — Ir à mesa › Anotar › Voltar à cozinha › Preparar › Servir.
- Viragem, toque e pedido: iguais (Mesa 12, "O teu restaurante").
- Painel: "O pedido aparece logo no painel do restaurante."
- Entrega: "E a equipa deixa de recolher pedidos, para se concentrar em servir."
- Assinatura: "Digitaliza os pedidos do teu restaurante."

## Vozes: Carlos vs. Maria

Gerámos as duas vozes com as mesmas definições (ElevenLabs, multilingual v2, estabilidade 0,5, estilo 0,2).

| | Carlos | Maria |
|---|---|---|
| Velocidade necessária para caber em ~30 s | 1,05 (quase natural) | 1,12 (mais apressada) |
| Duração final (praia / restaurante) | 30,7 s / 30,6 s | 31,4 s / 31,9 s |
| Registo | Grave, pausado, firme | Mais leve e próxima, mas mais lenta por natureza |

**Recomendação: Carlos.** Cabe nos 30 s quase à velocidade natural, por isso soa calmo e seguro — o tom de quem resolve um problema, que é o que um dono de restaurante quer ouvir. A Maria transmite proximidade, mas para caber no mesmo tempo tem de falar mais depressa, o que tira confiança. Para decidir de ouvido, há versões 9:16 das duas campanhas com a Maria.

## Verificação final

- **Ortografia:** todos os textos revistos (PT-PT, acordo ortográfico atual), incluindo legendas, faixa de passos, painel e fecho.
- **Sincronização voz/legendas:** as legendas usam os tempos de cada palavra devolvidos pela ElevenLabs; os blocos nunca deixam uma ou duas palavras soltas.
- **Locução:** sem cortes; cada cena dura o tempo da sua fala + 0,25 s.
- **Legibilidade em telemóvel:** legendas de 60–76 px a 1080 px de largura, fundo verde-escuro opaco, fora das zonas da interface do TikTok/Reels (topo 11%, fundo 23%).
- **Logótipo:** a mesma geometria em todo o lado (viragem e fecho), com o ponto menta.
- **Duração:** 30,6–31,9 s.
- **Exportação:** H.264, 1080×1920 e 1920×1080, 30 fps, CRF 18; áudio AAC 48 kHz a −14 LUFS.
- **Honestidade:** sem integrações POS nem pagamentos apresentados como concluídos; sem resultados, poupanças ou testemunhos inventados; sem website nem contactos.

## Como voltar a gerar

```sh
npm run voz:campanhas      # voz (só se mudar uma fala em src/v2/campaigns.ts)
npm run render:campanhas   # as 4 versões finais (Carlos) → out/campanhas/
sh scripts/exportar-campanhas.sh praia-maria-9x16   # outra combinação
```
Se o estúdio estiver aberto na porta 3001, a exportação usa a 3317.

Música e efeitos são sintetizados em código (provisórios, sem direitos). Para a versão paga em redes, pode trocar `public/audio/sfx/musica-*.wav` por música licenciada com os mesmos nomes.
