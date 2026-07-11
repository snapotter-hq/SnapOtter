---
description: "Konwertuje między formatami prezentacji PowerPoint i OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 30ef3616cb4e
---

# Convert Presentation {#convert-presentation}

Konwertuje prezentacje między formatami PowerPoint (PPTX) i OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Przyjmuje dane formularza multipart z plikiem PowerPoint/ODP oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Tak | - | Format wyjściowy: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Akceptowane formaty wejściowe: `.pptx`, `.ppt`, `.odp`.
- Konwersję obsługuje LibreOffice działający w trybie headless na serwerze.
- Animacje i efekty przejść mogą nie zostać zachowane między formatami.
- Format wyjściowy musi różnić się od formatu wejściowego.
