---
description: "Обрізання зображення до центрованого кола з прозорими кутами."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 7d99593a8739
---

# Обрізання по колу {#circle-crop}

Обрізання зображення до центрованого кола з прозорими кутами. Підтримує регульований масштаб, зсув, рамку та вихідний розмір.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Приймає дані форми у форматі multipart із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| zoom | number | Ні | `1` | Коефіцієнт масштабу (1-5); вищі значення обрізають щільніше |
| offsetX | number | Ні | `0.5` | Горизонтальне положення центру (0-1) |
| offsetY | number | Ні | `0.5` | Вертикальне положення центру (0-1) |
| borderWidth | integer | Ні | `0` | Ширина рамки в пікселях (0-200) |
| borderColor | string | Ні | `"#ffffff"` | Шістнадцятковий колір рамки |
| background | string | Ні | `"transparent"` | Заповнення кутів: `"transparent"` або шістнадцятковий колір |
| outputSize | integer | Ні | - | Кінцевий квадратний розмір у пікселях (16-4096) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Примітки {#notes}

- Вихідний формат завжди PNG для збереження прозорих кутів (якщо `background` не встановлено на суцільний колір).
- Коло вписується в коротший вимір зображення. Використовуйте `zoom` для щільнішого обрізання та `offsetX`/`offsetY` для зсуву видимої області.
- Коли надано `outputSize`, результат змінюється до цього квадратного розміру після обрізання.
- Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
