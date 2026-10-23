# MESVIO — identidade da marca

Nome comercial provisório. Escreve-se **MESVIO** em texto corrido e **mesvio.** no logótipo.

- **Slogan principal:** O empregado que não sabias que precisavas.
- **Slogan secundário:** Menos espera. Mais serviço.
- **Mensagem comercial:** Os teus clientes pedem. A tua equipa entrega. O teu negócio cresce.
- **Posicionamento:** plataforma de pedidos digitais por NFC e QR Code para restaurantes, bares de praia, hotéis, piscinas e espaços de hotelaria, sem instalar aplicações.

**Comunicação: o que não prometer.** Não apresentar poupança de funcionários nem aumento de vendas como resultados garantidos. Não anunciar a integração ZoneSoft nem os pagamentos no telemóvel como disponíveis em produção antes de estarem concluídos e validados.

## Cores
| Token (Tailwind) | Nome | Hex | Uso |
|---|---|---|---|
| `brand` | Verde-escuro | `#062D25` | Botões principais, cabeçalhos escuros, texto de destaque |
| `forest` | Verde profundo | `#102C2B` | Fundos escuros secundários |
| `mint` | Verde-menta | `#91E9C3` | Ponto do logótipo, acentos e botões **sobre fundo escuro** |
| `brand-soft` | Verde suave | `#C8E9DA` | Fundos de etiquetas e avisos informativos |
| `card` | Branco | `#FFFFFF` | Cartões |
| `paper` | Creme | `#F7F5F0` | Fundo das páginas |
| `ink` | Texto escuro | `#10211D` | Texto |
| `ink-soft` | — | `#4B5B56` | Texto secundário |
| `danger` / `danger-soft` | — | `#B42318` / `#FEF3F2` | Erros |

Contrastes (WCAG 2.1): texto/creme 15,3:1 · texto secundário/creme 6,6:1 · branco/verde-escuro 14,9:1 · verde-escuro/verde suave 11,4:1 · menta/verde-escuro 10,4:1 · erro 6,0:1. Todos passam AA (≥ 4,5:1).
**Regra:** o verde-menta nunca é texto sobre fundo claro (1,3:1).

## Tipografia
**Manrope** (SIL Open Font License, uso comercial livre), servida pelo próprio site através de `next/font`. Títulos em 700–800 com espaçamento −0,02 em; texto em 400–600.

## Logótipo
Desenhado com traços geométricos, sem depender de nenhuma fonte, a partir de uma fonte única: `src/components/brand/logo-geometry.ts`. Para regenerar os ficheiros SVG:

```bash
node --experimental-strip-types scripts/brand/gerar-logos.ts
```

| Ficheiro | Uso |
|---|---|
| `public/brand/mesvio-principal.svg` | Fundos claros |
| `public/brand/mesvio-negativo.svg` | Fundos escuros (transparente) |
| `public/brand/mesvio-negativo-fundo.svg` | Fundo verde-escuro incluído (redes sociais, apresentações) |
| `public/brand/mesvio-mono-escuro.svg` / `-mono-branco.svg` | Uma só cor (impressão, gravação) |
| `public/brand/mesvio-icone.svg` / `-icone-claro.svg` | Ícone reduzido "m." |
| `src/app/icon.svg` | Favicon |

Na app: `<Logo variant="light|dark|mono" />`, `<LogoMark />` e `<PoweredBy />` (assinatura discreta nas ementas) em `src/components/brand/logo.tsx`. Na versão para fundos claros, o ponto menta leva um contorno fino verde-escuro para continuar visível.

Área de proteção: pelo menos a altura do "m" à volta. Não esticar, não rodar, não mudar a cor do ponto (exceto nas versões monocromáticas).

## Ementa do restaurante
O destaque na ementa é do restaurante (nome, morada, fotografias). A MESVIO aparece só no rodapé, com "Pedidos digitais com mesvio.".

Cada restaurante pode definir no painel (**Aparência**, dono ou gerente) a sua cor principal e um logótipo:
- **Cor** (`establishments.brand_color`): substitui o verde-escuro na ementa, no estado do pedido e na conta. Só são aceites cores com contraste ≥ 4,5:1 para texto branco e sobre o creme; o tom suave é calculado automaticamente para manter AA (`src/lib/brand-color.ts`). A BD só aceita `#rrggbb`.
- **Logótipo** (`establishments.brand_logo_url`): endereço https de uma imagem alojada pelo restaurante (a BD recusa outros esquemas). Ainda não há envio de ficheiros: exige um armazenamento (ex.: Supabase Storage).

## Emails
Modelos HTML para a Supabase em `docs/emails/` (código de entrada e convite de equipa).
