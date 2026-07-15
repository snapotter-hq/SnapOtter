---
description: "Преобразование между YAML и JSON в обоих направлениях."
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: 2634cecb09dc
---

# Конвертация YAML / JSON {#yaml-json}

Преобразуйте форматы YAML и JSON в обоих направлениях. Загрузите файл YAML, чтобы получить JSON, или загрузите файл JSON, чтобы получить YAML.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Принимает multipart form data с файлом YAML или JSON. Поле настроек не требуется.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Направление преобразования определяется по расширению входного файла.

## Пример запроса {#example-request}

YAML в JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON в YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Примечания {#notes}

- Направление преобразования автоматически определяется по расширению входного файла: `.yaml` или `.yml` даёт `.json`, а `.json` даёт `.yaml`.
- Принимаются оба расширения `.yaml` и `.yml`.
- Преобразуется только первый документ в многодокументном файле YAML; дополнительные документы, разделённые `---`, игнорируются.
