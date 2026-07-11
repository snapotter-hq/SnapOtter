---
description: "Преобразование документов Word в PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: da95a50a168f
---

# Word в PDF {#word-to-pdf}

Преобразуйте документы Word, текст OpenDocument, RTF или файлы обычного текста в PDF.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Принимает multipart form data с файлом Word/ODT/RTF/TXT.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите документ, и он будет преобразован в PDF.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Принимаемые форматы ввода: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Преобразование выполняется LibreOffice, работающим в headless-режиме на сервере.
- При наличии используются шрифты, встроенные в документ; в противном случае подставляются системные шрифты.
- Верхние и нижние колонтитулы, таблицы и изображения сохраняются в выходном PDF.
