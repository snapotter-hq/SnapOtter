---
description: "Вирізає кліп із відео, задаючи час початку та кінця."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 330238137e74
---

# Trim Video {#trim-video}

Вирізає кліп із відео, задаючи час початку та кінця в секундах, з можливістю покадрово точного розрізання.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Час початку в секундах (має бути >= 0) |
| endS | number | Yes | - | Час кінця в секундах (має бути після startS) |
| precise | boolean | No | `false` | Перекодувати для покадрово точного розрізання замість пошуку за ключовими кадрами |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Коли `precise` дорівнює `false` (за замовчуванням), інструмент використовує пошук за ключовими кадрами, який швидкий, але може починатися на кілька кадрів раніше запитаного часу.
- Встановлення `precise` у `true` перекодовує сегмент для точних меж кадрів, але триває довше.
- Значення `endS` має бути більшим за `startS`.
