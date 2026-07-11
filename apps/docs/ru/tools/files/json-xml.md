---
description: "Конвертация между JSON и XML в обоих направлениях."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 85196f2a621c
---

# JSON в XML {#json-to-xml}

Конвертация между форматами JSON и XML в обоих направлениях. Загрузите файл JSON, чтобы получить XML, или загрузите файл XML, чтобы получить JSON.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Принимает multipart form data с файлом JSON или XML и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Нет | `true` | Форматированный вывод с отступами |

## Пример запроса {#example-request}

JSON в XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML в JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Примечания {#notes}

- Направление конвертации автоматически определяется по расширению входного файла: `.json` производит `.xml`, а `.xml` производит `.json`.
- Параметр `pretty` применяется к обоим направлениям. При `false` вывод является компактным без отступов.
- Атрибуты XML и вложенные структуры сохраняются при двусторонней конвертации по возможности.
