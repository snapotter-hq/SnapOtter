---
description: "Перетворення презентацій на PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 404acb2d24f5
---

# PowerPoint у PDF {#powerpoint-to-pdf}

Перетворення презентацій PowerPoint або OpenDocument на PDF, по одному слайду на сторінку.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Приймає дані форми у форматі multipart із файлом PowerPoint/ODP.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Завантажте презентацію, і її буде перетворено на PDF.

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Приклад відповіді {#example-response}

Повертає `202 Accepted`. Відстежуйте перебіг через SSE за адресою `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примітки {#notes}

- Прийнятні вхідні формати: `.pptx`, `.ppt`, `.odp`.
- Кожен слайд стає однією сторінкою у PDF.
- Перетворення виконується LibreOffice, що працює у безголовому режимі на сервері.
- Анімації та переходи не включаються у вихідний PDF.
