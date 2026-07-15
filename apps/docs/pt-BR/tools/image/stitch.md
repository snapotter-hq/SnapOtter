---
description: "Une imagens lado a lado, empilhadas ou em grade, com controle sobre alinhamento, espaçamentos, bordas e modo de redimensionamento."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: d66a33caeb4f
---

# Juntar Imagens {#stitch-combine}

Une várias imagens lado a lado, empilhadas verticalmente ou dispostas em grade. Suporta alinhamento, espaçamento, borda, raio de canto e vários modos de redimensionamento.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| direction | string | Não | `"horizontal"` | Direção do layout: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Não | 2 | Número de colunas quando a direção é `grid` (2 a 100) |
| resizeMode | string | Não | `"fit"` | Como as imagens são redimensionadas: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Não | `"center"` | Alinhamento no eixo transversal: `start`, `center`, `end` |
| gap | number | Não | 0 | Espaçamento entre imagens em pixels (0 a 1000) |
| border | number | Não | 0 | Largura da borda externa em pixels (0 a 500) |
| cornerRadius | number | Não | 0 | Raio de canto aplicado à saída final (0 a 500) |
| backgroundColor | string | Não | `"#FFFFFF"` | Cor de fundo/borda em hexadecimal (por exemplo, `#FF0000`) |
| format | string | Não | `"png"` | Formato de saída: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Não | 90 | Qualidade de saída (1 a 100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notas {#notes}

- Requer pelo menos 2 imagens. Envie vários arquivos de imagem na requisição multipart.
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente).
- Modos de redimensionamento:
  - `fit` - Redimensiona as imagens para corresponder à menor dimensão ao longo do eixo de junção.
  - `original` - Mantém os tamanhos originais (pode produzir bordas irregulares).
  - `stretch` - Força as imagens a corresponder à menor dimensão sem preservar a proporção.
  - `crop` - Recorta as imagens em modo cover para corresponder à menor dimensão.
- No modo `grid`, as células são dimensionadas com base nas dimensões medianas de todas as imagens.
- O(A) `cornerRadius` é aplicado(a) a toda a saída final, não a imagens individuais.
- O tamanho da tela (canvas) é limitado pela configuração de servidor `MAX_CANVAS_PIXELS` para evitar esgotamento de memória.
