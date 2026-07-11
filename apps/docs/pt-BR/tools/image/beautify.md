---
description: "Transforme capturas de tela simples em imagens sofisticadas com fundos em gradiente, molduras de dispositivos, sombras e dimensionamento para redes sociais."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 77a4d49f8101
---

# Embelezar Captura de Tela {#beautify-screenshot}

Adicione fundos em gradiente, molduras de dispositivos, sombras, marcas d'água e dimensionamento para redes sociais a capturas de tela. Ideal para criar imagens sofisticadas para marketing de produto, redes sociais e documentação.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Não | `"linear-gradient"` | Tipo de fundo: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | Não | `"#667eea"` | Cor de fundo sólida (usada quando `backgroundType` é `solid`) |
| gradientStops | array | Não | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Pontos de cor do gradiente (mín. 2). Cada ponto tem `color` (hex) e `position` (0-100). |
| gradientAngle | number | Não | 135 | Ângulo do gradiente em graus (0 a 360) |
| padding | number | Não | 64 | Espaçamento ao redor da imagem em pixels (0 a 256) |
| borderRadius | number | Não | 12 | Raio dos cantos da captura de tela (0 a 64) |
| shadowPreset | string | Não | `"subtle"` | Predefinição de sombra: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | Não | 20 | Raio de desfoque da sombra personalizada (0 a 100, usado quando `shadowPreset` é `custom`) |
| shadowOffsetX | number | Não | 0 | Deslocamento horizontal da sombra personalizada (-50 a 50) |
| shadowOffsetY | number | Não | 10 | Deslocamento vertical da sombra personalizada (-50 a 50) |
| shadowColor | string | Não | `"#000000"` | Cor da sombra personalizada em hex |
| shadowOpacity | number | Não | 30 | Opacidade da sombra personalizada (0 a 100) |
| frame | string | Não | `"none"` | Moldura de dispositivo ou janela: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | Não | - | Texto de título exibido nas barras de título das molduras de janela |
| socialPreset | string | Não | `"none"` | Redimensiona para dimensões de redes sociais: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | Não | - | Texto opcional de marca d'água sobreposto |
| watermarkPosition | string | Não | `"bottom-right"` | Posição da marca d'água: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | Não | 50 | Opacidade da marca d'água (0 a 100) |
| outputFormat | string | Não | `"png"` | Formato de saída: `png`, `jpeg`, `webp` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### Com Imagem de Fundo {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Observações {#notes}

- Aceita dois campos de arquivo: `file` (obrigatório, a captura de tela principal) e `backgroundImage` (opcional, usado quando `backgroundType` é `image`).
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente).
- As predefinições de sombra correspondem a valores específicos:
  - `subtle`: desfoque 20, offsetY 4, opacidade 20%
  - `medium`: desfoque 40, offsetY 10, opacidade 35%
  - `dramatic`: desfoque 80, offsetY 20, opacidade 50%
- As predefinições de redes sociais redimensionam a saída final para caber nas dimensões alvo usando o modo `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- As molduras de dispositivo (`iphone`, `macbook`, `ipad`) aplicam uma borda física ao redor da imagem e ignoram a configuração `borderRadius`.
- Quando a transparência é necessária (sombra, raio das bordas, molduras de dispositivo ou fundo transparente), a saída é forçada para PNG mesmo que `jpeg` esteja selecionado.
- Imagens de fundo não são suportadas no modo pipeline/lote.
