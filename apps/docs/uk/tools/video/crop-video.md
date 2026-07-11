---
description: "Обрізає ділянку з відео."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: bbc443a72186
---

# Crop Video {#crop-video}

Обрізає прямокутну ділянку з відео, задаючи розмір і положення ділянки.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Приймає дані форми multipart із відеофайлом і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Ширина ділянки обрізання в пікселях (мінімум 16) |
| height | integer | Yes | - | Висота ділянки обрізання в пікселях (мінімум 16) |
| x | integer | No | `0` | Горизонтальне зміщення від верхнього лівого кута |
| y | integer | No | `0` | Вертикальне зміщення від верхнього лівого кута |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Ділянка обрізання має вміщатися в розміри відео. Якщо `x + width` або `y + height` перевищує розмір джерела, запит повертає помилку 400.
- Мінімальний розмір обрізання - 16x16 пікселів.
- Розміри округлюються до парних чисел, як цього вимагає більшість відеокодеків.
