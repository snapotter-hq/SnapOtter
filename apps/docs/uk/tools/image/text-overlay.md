---
description: "Додавання стилізованих текстових накладень із тінями та фоновими блоками."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: 8ec0271e6fe8
---

# Текстове накладення {#text-overlay}

Додайте стилізований текст на зображення з опційною тінню та напівпрозорим фоновим блоком. Підходить для заголовків, підписів або анотацій на фотографіях.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Приймає багаточастинні дані форми із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| text | string | Так | - | Текст для накладення (від 1 до 500 символів) |
| fontSize | number | Ні | `48` | Розмір шрифту у пікселях (від 8 до 200) |
| color | string | Ні | `"#FFFFFF"` | Колір тексту у шістнадцятковому форматі (`#RRGGBB`) |
| position | string | Ні | `"bottom"` | Вертикальне розміщення: `top`, `center`, `bottom` |
| backgroundBox | boolean | Ні | `false` | Показувати напівпрозорий фоновий прямокутник за текстом |
| backgroundColor | string | Ні | `"#000000"` | Колір фонового блоку у шістнадцятковому форматі (`#RRGGBB`) |
| shadow | boolean | Ні | `true` | Застосувати тінь за текстом |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

З фоновим блоком:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Примітки {#notes}

- Текст завжди центрується горизонтально в межах зображення.
- Тінь використовує зсув 2px із розмиттям 3px при 70% чорної непрозорості.
- Фоновий блок охоплює всю ширину зображення при 70% непрозорості, з висотою, пропорційною розміру шрифту (1.8x).
- Текст рендериться через SVG-композит, тому використовується стандартний шрифт без засічок системи.
- XML-спеціальні символи в тексті безпечно екрануються.
- Формат виводу відповідає формату вводу. Вхідні файли HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
