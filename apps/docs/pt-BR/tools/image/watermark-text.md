---
description: "Adiciona marcas d'água de texto com posição, opacidade, rotação e repetição em mosaico configuráveis."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: c1e372453efb
---

# Marca d'Água de Texto {#text-watermark}

Adiciona uma sobreposição de marca d'água de texto a imagens. Suporta posicionamento único em cantos/centro ou repetição em mosaico por toda a imagem, com tamanho de fonte, cor, opacidade e rotação configuráveis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Texto da marca d'água (1 a 500 caracteres) |
| fontSize | number | Não | `48` | Tamanho da fonte em pixels (8 a 1000) |
| color | string | Não | `"#000000"` | Cor do texto em formato hexadecimal (`#RRGGBB`) |
| opacity | number | Não | `50` | Percentual de opacidade do texto (0 a 100) |
| position | string | Não | `"center"` | Posicionamento: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Não | `0` | Ângulo de rotação do texto em graus (-360 a 360) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Marca d'água em mosaico por toda a imagem:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notas {#notes}

- A marca d'água é renderizada como texto SVG e composta sobre a imagem, preservando a qualidade da saída.
- O modo em mosaico espaça os elementos de texto com base no tamanho da fonte (espaçamento de 6x horizontal, 4x vertical), limitado a no máximo 500 elementos.
- Para posições de canto, o preenchimento a partir da borda é igual ao tamanho da fonte.
- A fonte usada é a fonte sans-serif padrão do sistema.
- Caracteres especiais de XML no texto (`&`, `<`, `>`, `"`, `'`) são escapados com segurança.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
