---
description: "Конвертація між форматами Word, OpenDocument, RTF та простим текстом."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 0a1e6888ab88
---

# Convert Document {#convert-document}

Конвертація документів між форматами Word (DOCX), OpenDocument (ODT), RTF та простим текстом за допомогою LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Приймає дані форми multipart з файлом Word/ODT/RTF/TXT та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Формат виводу: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- Прийнятні вхідні формати: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Конвертація обробляється LibreOffice, що працює в безголовому режимі на сервері.
- Складне форматування (макроси, вбудовані об'єкти) може не зберегтися під час конвертації між форматами.
- Формат виводу має відрізнятися від вхідного формату.
