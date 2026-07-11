---
description: "Converte tra i formati di presentazione PowerPoint e OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 8e16f2290e49
---

# Convert Presentation {#convert-presentation}

Converte le presentazioni tra i formati PowerPoint (PPTX) e OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Accetta dati form multipart con un file PowerPoint/ODP e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Formato di output: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formati di input accettati: `.pptx`, `.ppt`, `.odp`.
- La conversione è gestita da LibreOffice in esecuzione headless sul server.
- Le animazioni e gli effetti di transizione potrebbero non essere preservati tra i formati.
- Il formato di output deve essere diverso dal formato di input.
