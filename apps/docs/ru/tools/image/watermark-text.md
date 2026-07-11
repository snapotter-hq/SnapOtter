---
description: "Добавление текстовых водяных знаков с настраиваемым положением, непрозрачностью, поворотом и мозаичным размещением."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 5bc84132fed1
---

# Текстовый водяной знак {#text-watermark}

Добавьте текстовое наложение водяного знака на изображения. Поддерживает одиночное размещение в углах/по центру или мозаичное повторение по всему изображению, с настраиваемым размером шрифта, цветом, непрозрачностью и поворотом.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Принимает multipart form data с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| text | string | Да | - | Текст водяного знака (от 1 до 500 символов) |
| fontSize | number | Нет | `48` | Размер шрифта в пикселях (от 8 до 1000) |
| color | string | Нет | `"#000000"` | Цвет текста в шестнадцатеричном формате (`#RRGGBB`) |
| opacity | number | Нет | `50` | Процент непрозрачности текста (от 0 до 100) |
| position | string | Нет | `"center"` | Размещение: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Нет | `0` | Угол поворота текста в градусах (от -360 до 360) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Мозаичный водяной знак по всему изображению:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Примечания {#notes}

- Водяной знак рендерится как SVG-текст и композитится на изображение, сохраняя качество вывода.
- Мозаичный режим располагает текстовые элементы на основе размера шрифта (6x горизонтальный, 4x вертикальный интервал), с ограничением до 500 элементов максимум.
- Для угловых позиций отступ от края равен размеру шрифта.
- Используется системный шрифт sans-serif по умолчанию.
- XML-специальные символы в тексте (`&`, `<`, `>`, `"`, `'`) безопасно экранируются.
- Формат вывода соответствует формату ввода. Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
