---
description: "Розташування сторінок PDF для складання в буклет."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 43910394cf4b
---

# Буклет PDF {#booklet-pdf}

Спустіть сторінки для двостороннього друку, щоб надруковані аркуші можна було скласти в буклет.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Приймає багаточастинні дані форми із файлом PDF та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Ні | `2` | Сторінок на аркуш: `2`, `4`, `6` або `8` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Примітки {#notes}

- Стандартне `perSheet: 2` розміщує дві сторінки поруч на кожному аркуші, що є стандартним компонуванням буклета для двостороннього друку.
- Порожні сторінки додаються автоматично, якщо загальна кількість сторінок не кратна розміру аркуша.
- Надрукуйте вивід двостороннім друком із зшиванням по короткому краю, потім складіть і скріпіть.
