---
description: "Reduza o tamanho do arquivo PDF comprimindo as imagens incorporadas."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 02373ca0a6ef
---

# Compress PDF {#compress-pdf}

Reduza o tamanho do arquivo PDF fazendo o downsampling das imagens incorporadas. Escolha entre um controle deslizante de qualidade ou um tamanho de arquivo alvo.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"quality"` | Modo de compressão: `quality` ou `targetSize` |
| quality | integer | Não | `75` | Qualidade da compressão, 1-100 (maior = menos compressão). Usado no modo `quality` |
| targetSizeKb | number | Não | - | Tamanho de arquivo alvo em kilobytes. Usado no modo `targetSize` |

## Example Request {#example-request}

Comprimir por qualidade:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimir para um tamanho alvo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- No modo `quality`, valores mais baixos produzem arquivos menores com mais degradação da imagem.
- No modo `targetSize`, uma busca binária encontra o maior DPI que cabe no tamanho solicitado.
- Se a compressão aumentar o tamanho do arquivo, os bytes originais são retornados sem alteração.
- O conteúdo de texto e vetorial não é afetado; apenas as imagens raster incorporadas passam por downsampling.
