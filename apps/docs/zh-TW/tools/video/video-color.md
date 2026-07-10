---
description: "調整影片的亮度、對比度、飽和度和 gamma。"
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 3c8006222812
---

# Video Color {#video-color}

調整影片的亮度、對比度、飽和度和 gamma 校正。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 亮度調整（-1 到 1） |
| contrast | number | No | `1` | 對比度倍率（0-4） |
| saturation | number | No | `1` | 飽和度倍率（0-3）。設為 0 可轉為灰階 |
| gamma | number | No | `1` | Gamma 校正（0.1-10） |

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

- 所有數值都為預設值時（亮度 0、對比度 1、飽和度 1、gamma 1）不會產生任何變化。
- 將飽和度設為 `0` 會將影片轉為灰階。
- Gamma 值低於 1 會提亮陰影，高於 1 則會使其變暗。
