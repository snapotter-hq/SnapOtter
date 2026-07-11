---
description: "Преобразование файлов Word, Markdown, HTML или обычного текста в EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 77fe8b2fcde1
---

# Преобразование в EPUB {#convert-to-epub}

Преобразуйте документы Word, Markdown, HTML или файлы обычного текста в формат электронной книги EPUB.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Принимает multipart form data с файлом Word/Markdown/HTML/TXT.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите документ, и он будет преобразован в EPUB.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Принимаемые форматы ввода: `.docx`, `.md`, `.html`, `.txt`.
- Вывод EPUB соответствует спецификации EPUB 3.
- Заголовки в исходном документе используются для формирования оглавления.
- Преобразование выполняется Pandoc на сервере.
