---
description: "Конвертация EPUB в PDF, DOCX, HTML или Markdown."
i18n_source_hash: 7d94fc18ca97
i18n_provenance: human
i18n_output_hash: e6fc76653944
---

# Конвертация EPUB {#convert-epub}

Конвертация электронной книги EPUB в PDF, Word (DOCX), HTML или Markdown. Удалённые ресурсы внутри книги не загружаются.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Принимает multipart form data с файлом EPUB и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Да | - | Формат вывода: `pdf`, `docx`, `html`, `md` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Принимаемый входной формат: `.epub`.
- Удалённые ресурсы, встроенные в EPUB (внешние изображения, шрифты), не загружаются в целях безопасности.
- Точность изображений в конвертированном выводе может различаться в зависимости от структуры EPUB.
- Конвертация выполняется Pandoc на сервере.
