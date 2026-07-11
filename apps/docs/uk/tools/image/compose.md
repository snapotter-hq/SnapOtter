---
description: "Накладайте зображення шарами з позицією, непрозорістю та режимами накладання для композиції."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 0405dfb3b316
---

# Image Composition {#image-composition}

Накладайте зображення-накладку поверх базового зображення з налаштовуваними позицією, непрозорістю та режимом накладання. Корисно для композиції логотипів, графіки або об'єднання кількох зображень.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

Приймає дані форми multipart із **двома** файлами зображень та полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | Горизонтальний зсув накладки від верхнього лівого кута в пікселях (мін. 0) |
| y | number | No | `0` | Вертикальний зсув накладки від верхнього лівого кута в пікселях (мін. 0) |
| opacity | number | No | `100` | Відсоток непрозорості накладки (від 0 до 100) |
| blendMode | string | No | `"over"` | Режим накладання для композиції |

### Blend Modes {#blend-modes}

| Value | Description |
|-------|-------------|
| `over` | Звичайна накладка (за замовчуванням) |
| `multiply` | Затемнення множенням значень пікселів |
| `screen` | Освітлення інвертуванням, множенням та повторним інвертуванням |
| `overlay` | Поєднує множення та освітлення залежно від яскравості основи |
| `darken` | Зберігає темніший піксель із кожного шару |
| `lighten` | Зберігає світліший піксель із кожного шару |
| `hard-light` | Накладка з сильним контрастом |
| `soft-light` | Накладка з м'яким контрастом |
| `difference` | Абсолютна різниця між шарами |
| `exclusion` | Схоже на різницю, але з нижчим контрастом |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | Базове/фонове зображення |
| overlay | Yes | Зображення-накладка/передній план |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Використання режиму накладання множенням:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- Обидва зображення перевіряються та декодуються (підтримуються HEIC, RAW, PSD, SVG) перед композицією.
- Накладка розміщується за точними піксельними координатами, вказаними в `x` та `y`. Вона не масштабується для підгонки.
- Якщо непрозорість менша за 100, до накладки застосовується альфа-маска перед накладанням.
- Накладка може виходити за межі базового зображення (вона буде обрізана).
- Орієнтація EXIF автоматично застосовується до обох зображень перед обробкою.
- Розміри виводу збігаються з розмірами базового зображення.
