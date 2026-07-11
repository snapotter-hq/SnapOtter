---
description: "Конвертация файла Markdown в документ Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: c66ccfdbebf7
---

# Markdown в Word {#markdown-to-word}

Конвертация файла Markdown в документ Word (DOCX) с сохранением заголовков, списков, блоков кода и другого форматирования.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Принимает multipart form data с файлом Markdown.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите файл Markdown, и он будет конвертирован в DOCX.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.md`, `.markdown`.
- Это быстрый (синхронный) инструмент, который возвращает результат напрямую.
- Заголовки, полужирный, курсив, ссылки, блоки кода и списки сопоставляются со стилями Word.
- Конвертация выполняется Pandoc на сервере.
