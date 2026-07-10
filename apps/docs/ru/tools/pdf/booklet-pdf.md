---
description: "Компоновка страниц PDF для складывания в буклет."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 447850c35077
---

# Буклет PDF {#booklet-pdf}

Расположите страницы для дуплексной печати так, чтобы отпечатанные листы можно было сложить в буклет.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Принимает multipart form data с файлом PDF и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Нет | `2` | Страниц на лист: `2`, `4`, `6` или `8` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Примечания {#notes}

- Значение по умолчанию `perSheet: 2` размещает две страницы бок о бок на каждом листе, что является стандартной компоновкой буклета для дуплексной печати.
- Пустые страницы добавляются автоматически, если общее количество страниц не кратно размеру листа.
- Печатайте вывод двусторонним способом с переплётом по короткому краю, затем сложите и скрепите.
