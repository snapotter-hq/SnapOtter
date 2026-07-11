---
description: "從影片中裁切出一個區域。"
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: ec906499aa1d
---

# Crop Video {#crop-video}

透過指定區域的大小和位置，從影片中裁切出一個矩形區域。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | 裁切區域寬度（以像素為單位，最小 16） |
| height | integer | Yes | - | 裁切區域高度（以像素為單位，最小 16） |
| x | integer | No | `0` | 從左上角起算的水平偏移量 |
| y | integer | No | `0` | 從左上角起算的垂直偏移量 |

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

- 裁切區域必須位於影片尺寸範圍內。若 `x + width` 或 `y + height` 超出來源大小，請求會回傳 400 錯誤。
- 最小裁切尺寸為 16x16 像素。
- 尺寸會四捨五入為偶數，因為大多數影片編解碼器都有此要求。
