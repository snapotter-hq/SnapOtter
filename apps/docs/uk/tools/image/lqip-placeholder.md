---
description: "Генеруйте крихітний низькоякісний плейсхолдер зображення з data URI у форматі base64."
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 4293d988254d
---

# Плейсхолдер LQIP {#lqip-placeholder}

Генеруйте крихітний низькоякісний плейсхолдер зображення (LQIP) із вихідного зображення. Повертає невеликий файл плейсхолдера разом із data URI у форматі base64, готовим до використання тегом HTML `<img>` та фрагментом CSS `background-image` для негайного вбудовування.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

Приймає дані форми multipart з файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обовʼязковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| width | integer | Ні | `16` | Цільова ширина в пікселях (4-64) |
| blur | number | Ні | `2` | Радіус розмиття для стратегії розмиття (0-20) |
| strategy | string | Ні | `"blur"` | Стратегія плейсхолдера: `blur`, `pixelate` або `solid` |
| format | string | Ні | `"webp"` | Формат виводу: `webp`, `png` або `jpeg` |
| quality | integer | Ні | `50` | Якість виводу (1-100) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Примітки {#notes}

- Поле `dataUri` містить повний data URI, готовий до використання в атрибутах `src` або CSS без додаткових запитів.
- Поля `html` та `css` надають фрагменти для копіювання-вставлення для поширених випадків використання.
- Стратегія `blur` дає мʼяку розмиту мініатюру. Стратегія `pixelate` створює блочну мозаїку. Стратегія `solid` повертає єдиний усереднений колір.
- Типові розміри плейсхолдерів — 200-500 байтів, що робить їх придатними для вбудовування напряму в HTML.
- Висота обчислюється автоматично для збереження співвідношення сторін вихідного зображення.
- Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
