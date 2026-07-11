---
description: "Додавання текстових водяних знаків із налаштовуваним положенням, непрозорістю, обертанням та мозаїчним повторенням."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 6b9fc76a1a3d
---

# Текстовий водяний знак {#text-watermark}

Додайте текстове накладення водяного знака на зображення. Підтримує одиночне розміщення в кутах/центрі або мозаїчне повторення по всьому зображенню, з налаштовуваними розміром шрифту, кольором, непрозорістю та обертанням.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Приймає багаточастинні дані форми із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| text | string | Так | - | Текст водяного знака (від 1 до 500 символів) |
| fontSize | number | Ні | `48` | Розмір шрифту у пікселях (від 8 до 1000) |
| color | string | Ні | `"#000000"` | Колір тексту у шістнадцятковому форматі (`#RRGGBB`) |
| opacity | number | Ні | `50` | Відсоток непрозорості тексту (від 0 до 100) |
| position | string | Ні | `"center"` | Розміщення: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Ні | `0` | Кут обертання тексту у градусах (від -360 до 360) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Мозаїчний водяний знак по всьому зображенню:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Примітки {#notes}

- Водяний знак рендериться як SVG-текст і компонується на зображення, зберігаючи якість виводу.
- Мозаїчний режим розміщує текстові елементи на основі розміру шрифту (проміжки 6x горизонтально, 4x вертикально), з обмеженням максимум у 500 елементів.
- Для кутових положень відступ від краю дорівнює розміру шрифту.
- Використовуваний шрифт — це стандартний шрифт без засічок системи.
- XML-спеціальні символи в тексті (`&`, `<`, `>`, `"`, `'`) безпечно екрануються.
- Формат виводу відповідає формату вводу. Вхідні файли HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
