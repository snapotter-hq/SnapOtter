---
description: "Recorte todas as páginas de um PDF com uma margem uniforme."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 5cb3e156ad55
---

# Crop PDF {#crop-pdf}

Recorte todas as páginas de um PDF aplicando uma margem uniforme, cortando o conteúdo de cada borda igualmente.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| margin | number | Não | `20` | Margem de recorte uniforme em pontos (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- O valor da margem é em pontos PDF (1 ponto = 1/72 polegada).
- A mesma margem é aplicada às quatro bordas de cada página.
- Uma margem de `0` remove todas as margens de recorte existentes, exibindo a media box completa.
