---
description: "Adiciona sobreposições de texto estilizadas com sombras projetadas e caixas de fundo."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 0332efa64c20
---

# Sobreposição de Texto (Text Overlay) {#text-overlay}

Adiciona texto estilizado a imagens, com sombra projetada e caixa de fundo semitransparente opcionais. Adequado para títulos, legendas ou anotações em fotos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Texto a sobrepor (1 a 500 caracteres) |
| fontSize | number | Não | `48` | Tamanho da fonte em pixels (8 a 200) |
| color | string | Não | `"#FFFFFF"` | Cor do texto em formato hexadecimal (`#RRGGBB`) |
| position | string | Não | `"bottom"` | Posicionamento vertical: `top`, `center`, `bottom` |
| backgroundBox | boolean | Não | `false` | Exibe um retângulo de fundo semitransparente atrás do texto |
| backgroundColor | string | Não | `"#000000"` | Cor da caixa de fundo em formato hexadecimal (`#RRGGBB`) |
| shadow | boolean | Não | `true` | Aplica uma sombra projetada atrás do texto |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Com uma caixa de fundo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notas {#notes}

- O texto é sempre centralizado horizontalmente na imagem.
- A sombra projetada usa um deslocamento de 2px com desfoque de 3px em 70% de opacidade preta.
- A caixa de fundo ocupa toda a largura da imagem com 70% de opacidade, com altura proporcional ao tamanho da fonte (1,8x).
- O texto é renderizado via composição SVG, portanto a fonte sans-serif padrão do sistema é usada.
- Caracteres especiais de XML no texto são escapados com segurança.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
