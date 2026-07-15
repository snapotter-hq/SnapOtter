---
description: "Перетворення між YAML та JSON в обох напрямках."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 9485ff5bde52
---

# Конвертація YAML / JSON {#yaml-json}

Перетворення між форматами YAML та JSON в обох напрямках. Завантажте файл YAML, щоб отримати JSON, або файл JSON, щоб отримати YAML.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Приймає дані форми у форматі multipart із файлом YAML або JSON. Поле налаштувань не потрібне.

## Параметри {#parameters}

Цей інструмент не має настроюваних параметрів. Напрямок перетворення визначається за розширенням вхідного файлу.

## Приклад запиту {#example-request}

YAML у JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON у YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Примітки {#notes}

- Напрямок перетворення визначається автоматично за розширенням вхідного файлу: `.yaml` або `.yml` дає `.json`, а `.json` дає `.yaml`.
- Приймаються обидва розширення `.yaml` та `.yml`.
- Перетворюється лише перший документ у багатодокументному файлі YAML; додаткові документи, розділені `---`, ігноруються.
