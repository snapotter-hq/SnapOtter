---
description: "Konversi antar format presentasi PowerPoint dan OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 7d3fe3aec067
---

# Convert Presentation {#convert-presentation}

Konversi presentasi antar format PowerPoint (PPTX) dan OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Menerima multipart form data berisi file PowerPoint/ODP dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Format output: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Mengembalikan `202 Accepted`. Lacak progres melalui SSE di `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Format input yang diterima: `.pptx`, `.ppt`, `.odp`.
- Konversi ditangani oleh LibreOffice yang berjalan headless di server.
- Efek animasi dan transisi mungkin tidak dipertahankan antar format.
- Format output harus berbeda dari format input.
