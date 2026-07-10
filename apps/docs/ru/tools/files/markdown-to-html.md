---
description: "Конвертация файла Markdown в автономную HTML-страницу."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 6df2fee7eb7a
---

# Markdown в HTML {#markdown-to-html}

Конвертация файла Markdown в автономную HTML-страницу. Удалённые изображения, на которые есть ссылки в исходнике, остаются в выводе без изменений.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Принимает multipart form data с файлом Markdown.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите файл Markdown, и он будет конвертирован в HTML.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.md`, `.markdown`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Вывод представляет собой самодостаточную HTML-страницу со встроенными стилями.
- URL удалённых изображений в исходнике Markdown сохраняются без изменений и не загружаются.
