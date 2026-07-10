---
description: "Combina várias imagens em uma única grade de sprite sheet com metadados de quadros."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: fd3617165b30
---

# Sprite Sheet {#sprite-sheet}

Combina várias imagens em uma única grade de sprite sheet. Cada imagem é redimensionada para corresponder às dimensões da primeira imagem e posicionada na grade. Retorna a imagem do sprite sheet junto com metadados de coordenadas por quadro.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Aceita dados de formulário multipart com dois ou mais arquivos de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| columns | integer | Não | `4` | Número de colunas na grade (1-16) |
| padding | integer | Não | `0` | Preenchimento entre células em pixels (0-64) |
| background | string | Não | `"#ffffff"` | Cor de fundo em hexadecimal |
| format | string | Não | `"png"` | Formato de saída: `png`, `webp` ou `jpeg` |
| quality | integer | Não | `90` | Qualidade de saída (1-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notas {#notes}

- Aceita de 2 a 64 imagens. Todas as imagens são redimensionadas para corresponder às dimensões da primeira imagem enviada.
- O array `frames` fornece as coordenadas exatas em pixels de cada quadro na saída, adequadas para definições de sprite CSS ou mapas de quadros de motores de jogo.
- O número de linhas é calculado automaticamente a partir da contagem de imagens e do valor de `columns`.
- Use o parâmetro `padding` para adicionar espaçamento entre as células. A cor `background` fica visível nas áreas de preenchimento e em quaisquer células finais vazias.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
