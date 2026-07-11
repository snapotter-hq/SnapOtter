---
description: "Конвертуйте анімований GIF у WebP і навпаки, зберігаючи всі кадри."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 298691128597
---

# Конвертер GIF/WebP {#gif-webp-converter}

Конвертуйте анімовані файли GIF у WebP і навпаки, зберігаючи всі кадри та тайминг анімації. Анімації WebP зазвичай на 25-35% менші за еквівалентні GIF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Приймає дані форми multipart з файлом GIF або WebP та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| quality | integer | Ні | `80` | Якість виводу для кодування WebP (1-100) |
| lossless | boolean | Ні | `false` | Використовувати стиснення WebP без втрат |
| resizePercent | integer | Ні | `100` | Масштабувати вивід у відсотках (10-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Примітки {#notes}

- Приймаються лише файли `.gif` та `.webp`. Інші формати зображень цим інструментом не підтримуються.
- Напрямок конвертації визначається автоматично: вхід GIF дає вивід WebP, а вхід WebP дає вивід GIF.
- Параметри `quality` та `lossless` застосовуються лише при кодуванні в WebP. Під час конвертації в GIF вивід використовує стандартну палітру GIF.
- Використовуйте `resizePercent`, щоб зменшити розміри (та розмір файлу) великих анімацій.
