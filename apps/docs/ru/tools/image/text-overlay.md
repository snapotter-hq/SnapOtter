---
description: "Добавление стилизованных текстовых наложений с тенями и фоновыми блоками."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: f3ba1959987a
---

# Текстовое наложение {#text-overlay}

Добавьте стилизованный текст на изображения с опциональной тенью и полупрозрачным фоновым блоком. Подходит для заголовков, подписей или аннотаций на фотографиях.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Принимает multipart form data с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| text | string | Да | - | Текст для наложения (от 1 до 500 символов) |
| fontSize | number | Нет | `48` | Размер шрифта в пикселях (от 8 до 200) |
| color | string | Нет | `"#FFFFFF"` | Цвет текста в шестнадцатеричном формате (`#RRGGBB`) |
| position | string | Нет | `"bottom"` | Вертикальное размещение: `top`, `center`, `bottom` |
| backgroundBox | boolean | Нет | `false` | Показать полупрозрачный фоновый прямоугольник за текстом |
| backgroundColor | string | Нет | `"#000000"` | Цвет фонового блока в шестнадцатеричном формате (`#RRGGBB`) |
| shadow | boolean | Нет | `true` | Применить тень за текстом |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

С фоновым блоком:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Примечания {#notes}

- Текст всегда центрируется по горизонтали в пределах изображения.
- Тень использует смещение 2px с размытием 3px при 70% непрозрачности чёрного.
- Фоновый блок занимает всю ширину изображения при 70% непрозрачности, с высотой, пропорциональной размеру шрифта (1.8x).
- Текст рендерится через SVG-композит, поэтому используется системный шрифт sans-serif по умолчанию.
- XML-специальные символы в тексте безопасно экранируются.
- Формат вывода соответствует формату ввода. Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
