---
description: "Преобразование презентаций в PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: 415bb45ea070
---

# PowerPoint в PDF {#powerpoint-to-pdf}

Преобразуйте презентации PowerPoint или OpenDocument в PDF, по одному слайду на страницу.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Принимает multipart form data с файлом PowerPoint/ODP.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите презентацию, и она будет преобразована в PDF.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Пример ответа {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примечания {#notes}

- Принимаемые форматы ввода: `.pptx`, `.ppt`, `.odp`.
- Каждый слайд становится одной страницей в PDF.
- Преобразование выполняется LibreOffice, работающим в headless-режиме на сервере.
- Анимации и переходы не включаются в выходной PDF.
