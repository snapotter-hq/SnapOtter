---
description: "Преобразование файла Markdown в стилизованный PDF."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: d3e35c50399c
---

# Markdown в PDF {#markdown-to-pdf}

Преобразуйте файл Markdown в стилизованный документ PDF. Удалённые ресурсы отключены в целях конфиденциальности.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Принимает multipart form data с файлом Markdown.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите файл Markdown, и он будет преобразован в PDF.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Принимаемые форматы ввода: `.md`, `.markdown`.
- Удалённые ресурсы (изображения, таблицы стилей, на которые ссылаются URL) не загружаются в целях конфиденциальности и безопасности.
- Markdown сначала преобразуется в HTML, затем в PDF с помощью WeasyPrint.
- Блоки кода, таблицы и другие элементы Markdown стилизуются в выходном PDF.
