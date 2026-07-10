---
description: "Конвертація між форматами презентацій PowerPoint та OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: bcacb2d65bb7
---

# Convert Presentation {#convert-presentation}

Конвертація презентацій між форматами PowerPoint (PPTX) та OpenDocument Presentation (ODP).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Приймає дані форми multipart з файлом PowerPoint/ODP та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Формат виводу: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Example Response {#example-response}

Повертає `202 Accepted`. Відстежуйте прогрес через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Прийнятні вхідні формати: `.pptx`, `.ppt`, `.odp`.
- Конвертація обробляється LibreOffice, що працює в безголовому режимі на сервері.
- Анімації та ефекти переходів можуть не зберегтися між форматами.
- Формат виводу має відрізнятися від вхідного формату.
