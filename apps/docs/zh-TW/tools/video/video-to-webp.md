---
description: "將影片片段轉換為動畫 WebP 圖片。"
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 89558bda5e15
---

# Video to WebP {#video-to-webp}

將影片片段轉換為動畫 WebP 圖片，並可設定影格率、寬度和品質。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 輸出影格率（1-30） |
| width | integer | No | `480` | 輸出寬度（以像素為單位，16-1920）。高度會按比例縮放 |
| quality | integer | No | `75` | WebP 壓縮品質（1-100） |
| loop | boolean | No | `true` | 循環播放動畫 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 動畫 WebP 產生的檔案比 GIF 更小，且色彩支援更佳（24 位元 vs 8 位元調色盤）。
- 較低的 `quality` 值會產生較小的檔案，代價是視覺保真度。
- 對於應只播放一次即停止的動畫，將 `loop` 設為 `false`。
