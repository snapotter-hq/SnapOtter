---
description: "Combine várias imagens em colagens em grade com mais de 25 modelos, espaçamentos e cantos ajustáveis, além de deslocamento e zoom por célula."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 5d70719c40fc
---

# Colagem / Grade {#collage-grid}

Combine várias imagens em colagens em grade com mais de 25 modelos. Suporta layouts de 2 a 9 imagens com espaçamento, raio de canto, cor de fundo e controles de deslocamento/zoom por célula personalizáveis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| templateId | string | Sim | - | ID do layout do modelo (ex.: `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Não | - | Array de configurações por célula com `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Sim | - | Índice da imagem a colocar nesta célula (baseado em 0) |
| cells[].panX | number | Não | 0 | Deslocamento horizontal (-100 a 100) |
| cells[].panY | number | Não | 0 | Deslocamento vertical (-100 a 100) |
| cells[].zoom | number | Não | 1 | Nível de zoom (1 a 10) |
| cells[].objectFit | string | Não | `"cover"` | Como a imagem preenche a célula: `cover` ou `contain` |
| gap | number | Não | 8 | Espaçamento entre células em pixels (0 a 500) |
| cornerRadius | number | Não | 0 | Raio de canto de cada célula em pixels (0 a 500) |
| backgroundColor | string | Não | `"#FFFFFF"` | Cor de fundo em hexadecimal ou `"transparent"` |
| aspectRatio | string | Não | `"free"` | Proporção do canvas: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Não | `"png"` | Formato de saída: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Não | 90 | Qualidade de saída (1 a 100) |

## Modelos Disponíveis {#available-templates}

| ID do Modelo | Imagens | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | Duas colunas iguais |
| `2-v-equal` | 2 | Duas linhas iguais |
| `2-h-left-large` | 2 | Esquerda 2/3, direita 1/3 |
| `2-h-right-large` | 2 | Esquerda 1/3, direita 2/3 |
| `3-left-large` | 3 | Grande à esquerda, duas empilhadas à direita |
| `3-right-large` | 3 | Duas empilhadas à esquerda, grande à direita |
| `3-top-large` | 3 | Grande no topo, duas colunas embaixo |
| `3-h-equal` | 3 | Três colunas iguais |
| `3-v-equal` | 3 | Três linhas iguais |
| `4-grid` | 4 | Grade 2x2 |
| `4-left-large` | 4 | Grande à esquerda, três empilhadas à direita |
| `4-top-large` | 4 | Grande no topo, três colunas embaixo |
| `4-bottom-large` | 4 | Três colunas no topo, grande embaixo |
| `5-top2-bottom3` | 5 | Duas no topo, três embaixo |
| `5-top3-bottom2` | 5 | Três no topo, duas embaixo |
| `5-left-large` | 5 | Grande à esquerda, quatro empilhadas à direita |
| `5-center-large` | 5 | Grande ao centro, quatro nos cantos |
| `6-grid-2x3` | 6 | 2 colunas x 3 linhas |
| `6-grid-3x2` | 6 | 3 colunas x 2 linhas |
| `6-top-large` | 6 | Grande no topo, cinco colunas embaixo |
| `7-mosaic` | 7 | Layout mosaico |
| `8-mosaic` | 8 | Layout mosaico |
| `9-grid` | 9 | Grade 3x3 |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notas {#notes}

- Envie vários arquivos de imagem na requisição multipart. As imagens são atribuídas às células do modelo na ordem de upload.
- Se forem enviadas mais imagens do que o modelo suporta, as imagens extras são ignoradas.
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente).
- O tamanho base do canvas é de 2400px no lado mais longo, escalado conforme a proporção escolhida.
- Quando `aspectRatio` é `"free"`, o canvas assume 4:3 por padrão (2400x1800).
- Os valores de `panX`/`panY` por célula deslocam a janela de recorte dentro da célula. Um valor de 100 move totalmente para uma borda, -100 para a outra.
- A cor de fundo `"transparent"` só é preservada com os formatos de saída `png`, `webp` ou `avif`.
