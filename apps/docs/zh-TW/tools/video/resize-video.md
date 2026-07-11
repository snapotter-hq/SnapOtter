---
description: "將影片縮放至新的解析度或預設尺寸。"
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: 4f44eb3d05bd
---

# Resize Video {#resize-video}

使用自訂像素尺寸或標準預設，將影片縮放至新的解析度。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | 目標寬度（以像素為單位，16-7680） |
| height | integer | No | - | 目標高度（以像素為單位，16-4320） |
| preset | string | No | `"custom"` | 解析度預設：`custom`、`2160p`、`1440p`、`1080p`、`720p`、`480p`、`360p` |

當 `preset` 為 `"custom"` 時，必須至少提供 `width` 或 `height` 其中一個。另一個尺寸會按比例縮放。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

縮放至自訂尺寸：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- 預設值對應到標準高度（例如 `720p` = 1280x720、`1080p` = 1920x1080）。寬度會依來源長寬比按比例縮放。
- 尺寸會四捨五入為偶數，因為大多數影片編解碼器都有此要求。
- 支援的最大解析度為 7680x4320（8K UHD）。
