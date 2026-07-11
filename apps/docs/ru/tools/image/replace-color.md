---
description: "Замена определённого цвета в изображении на другой цвет или превращение его в прозрачный."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: e80cc52eb451
---

# Замена и инверсия цвета {#replace-invert-color}

Замена пикселей, совпадающих с исходным цветом, целевым цветом или превращение их в прозрачные. Использует евклидово расстояние в пространстве RGB с настраиваемым допуском для плавного смешивания на границах цветов.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Принимает multipart form data с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Нет | `"#FF0000"` | Hex-цвет для поиска (формат: `#RRGGBB`) |
| targetColor | string | Нет | `"#00FF00"` | Hex-цвет для замены (формат: `#RRGGBB`) |
| makeTransparent | boolean | Нет | `false` | Сделать совпадающие пиксели прозрачными вместо замены целевым цветом |
| tolerance | number | Нет | `30` | Допуск совпадения цвета (от 0 до 255). Более высокие значения совпадают с более широким диапазоном похожих цветов |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Сделать зелёный фон прозрачным:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Примечания {#notes}

- Совпадение цвета использует евклидово расстояние в пространстве RGB, масштабированное на `tolerance * sqrt(3)`.
- Смешивание при замене пропорционально расстоянию до цвета: пиксели, более близкие к исходному цвету, получают больше целевого цвета, создавая плавные переходы.
- Когда `makeTransparent` равно `true`, вывод принудительно устанавливается в PNG (или WebP/AVIF), если входной формат не поддерживает альфа-каналы (например, JPEG).
- Допуск 0 совпадает только с точным исходным цветом. Более высокие значения (50+) совпадают с более широким диапазоном похожих оттенков.
- Выходной формат совпадает с входным, если не требуется прозрачность, а входной формат не поддерживает альфа-канал.
