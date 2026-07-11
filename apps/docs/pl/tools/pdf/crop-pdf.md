---
description: "Przytnij wszystkie strony pliku PDF jednolitym marginesem."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: faa858ae0744
---

# Crop PDF {#crop-pdf}

Przytnij wszystkie strony pliku PDF, stosując jednolity margines i usuwając treść z każdej krawędzi w równym stopniu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | Jednolity margines przycięcia w punktach (0-2000) |

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

- Wartość marginesu podawana jest w punktach PDF (1 punkt = 1/72 cala).
- Ten sam margines jest stosowany do wszystkich czterech krawędzi każdej strony.
- Margines `0` usuwa wszystkie istniejące marginesy przycięcia, pokazując pełną ramkę mediów (media box).
