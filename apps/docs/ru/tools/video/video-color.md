---
description: "Настройка яркости, контрастности, насыщенности и гаммы видео."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: a7ee213a943b
---

# Video Color {#video-color}

Настройка яркости, контрастности, насыщенности и гамма-коррекции видео.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Принимает multipart form data с файлом видео и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Настройка яркости (от -1 до 1) |
| contrast | number | No | `1` | Множитель контрастности (0-4) |
| saturation | number | No | `1` | Множитель насыщенности (0-3). Установите 0 для оттенков серого |
| gamma | number | No | `1` | Гамма-коррекция (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Все значения по умолчанию (яркость 0, контрастность 1, насыщенность 1, гамма 1) не вносят изменений.
- Установка насыщенности в `0` преобразует видео в оттенки серого.
- Значения гаммы ниже 1 осветляют тени, а значения выше 1 затемняют их.
