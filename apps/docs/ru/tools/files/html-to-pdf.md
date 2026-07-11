---
description: "Конвертация файла HTML в PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: e08607c41b3f
---

# HTML в PDF {#html-to-pdf}

Конвертация файла HTML в стилизованный документ PDF. Удалённые ресурсы (внешние изображения, таблицы стилей, скрипты) отключены в целях конфиденциальности.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Принимает multipart form data с файлом HTML.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Загрузите файл HTML, и он будет конвертирован в PDF.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Принимаемые входные форматы: `.html`, `.htm`.
- Удалённые ресурсы (изображения, таблицы стилей, скрипты, на которые ссылаются URL) не загружаются в целях конфиденциальности и безопасности.
- Встроенные стили и встроенные изображения (data URI) сохраняются.
- Конвертация выполняется WeasyPrint на сервере.
