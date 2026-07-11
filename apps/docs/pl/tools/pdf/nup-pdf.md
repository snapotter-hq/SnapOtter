---
description: "Rozmieść wiele stron PDF na jednym arkuszu (2-up, 4-up itd.)."
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: af436a5cb52d
---

# N-up PDF {#n-up-pdf}

Rozmieść wiele stron na jednym arkuszu, aby oszczędzać papier podczas drukowania, na przykład w układach 2-up lub 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | Stron na arkusz: `2`, `3`, `4`, `8`, `9`, `12` lub `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Strony są rozmieszczane w kolejności czytania (od lewej do prawej, z góry na dół).
- Rozmiar strony wynikowej odpowiada oryginałowi; poszczególne strony są skalowane w dół, aby zmieścić się w siatce.
- Dokument 20-stronicowy z `perSheet: 4` daje wynik 5-stronicowy.
