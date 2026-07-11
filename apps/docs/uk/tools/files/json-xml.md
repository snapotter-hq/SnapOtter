---
description: "Конвертація між JSON та XML в обох напрямках."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 4e39b9675ce7
---

# JSON to XML {#json-to-xml}

Конвертація між форматами JSON та XML в обох напрямках. Завантажте файл JSON, щоб отримати XML, або завантажте файл XML, щоб отримати JSON.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Приймає дані форми multipart з файлом JSON чи XML та JSON-полем `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | Форматований вивід з відступами |

## Example Request {#example-request}

JSON у XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML у JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- Напрямок конвертації визначається автоматично з розширення вхідного файлу: `.json` дає `.xml`, а `.xml` дає `.json`.
- Параметр `pretty` застосовується в обох напрямках. Коли `false`, вивід є компактним без відступів.
- Атрибути XML та вкладені структури зберігаються під час зворотної конвертації, де це можливо.
