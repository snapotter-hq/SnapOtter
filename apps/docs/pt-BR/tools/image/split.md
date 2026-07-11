---
description: "Divide uma imagem em blocos de grade por linhas e colunas ou por tamanho em pixels, retornados como um arquivo ZIP."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: 3bdfc58d5c96
---

# Divisão de Imagem (Image Splitting) {#image-splitting}

Divide uma única imagem em blocos de grade por contagem de colunas/linhas ou por dimensões específicas em pixels. Retorna um arquivo ZIP contendo todos os blocos.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| columns | integer | Não | 3 | Número de colunas para dividir (1 a 100) |
| rows | integer | Não | 3 | Número de linhas para dividir (1 a 100) |
| tileWidth | integer | Não | - | Largura do bloco em pixels (mín. 10). Sobrepõe `columns` quando `tileWidth` e `tileHeight` estão definidos. |
| tileHeight | integer | Não | - | Altura do bloco em pixels (mín. 10). Sobrepõe `rows` quando `tileWidth` e `tileHeight` estão definidos. |
| outputFormat | string | Não | `"original"` | Formato de saída para os blocos: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Não | 90 | Qualidade de saída para formatos com perdas (1 a 100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Exemplo de Resposta {#example-response}

A resposta é transmitida diretamente como um arquivo ZIP com `Content-Type: application/zip`. O nome do arquivo segue o padrão `split-<jobId>.zip`.

Cada bloco dentro do ZIP é nomeado `<originalBaseName>_r<row>_c<col>.<ext>` (por exemplo, `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Notas {#notes}

- Aceita um único arquivo de imagem.
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente).
- Quando `tileWidth` e `tileHeight` são fornecidos, eles têm prioridade sobre `columns`/`rows`. As dimensões da grade são calculadas como `ceil(imageWidth / tileWidth)` e `ceil(imageHeight / tileHeight)`.
- Os blocos de borda (coluna mais à direita, linha inferior) podem ser menores que o tamanho de bloco especificado se as dimensões da imagem não forem divisíveis de forma exata.
- O tamanho máximo da grade é limitado a 100x100 (10.000 blocos).
- A resposta transmite o ZIP diretamente, portanto não há corpo de resposta JSON. Use `--output` com curl para salvar o arquivo.
