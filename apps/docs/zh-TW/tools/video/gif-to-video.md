---
description: "將動畫 GIF 轉換為 MP4、WebM 或 MOV 影片。"
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: bf239f5dfc24
---

# GIF to Video {#gif-to-video}

將動畫 GIF 轉換為精簡的 MP4、WebM 或 MOV 影片檔案。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

接受包含一個 GIF 檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 輸出格式：`mp4`、`webm`、`mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- 將 GIF 轉換為影片通常可縮小 80-90% 的檔案大小，同時維持相同的視覺品質。
- 只接受動畫 GIF 檔案。靜態圖片應使用圖片 Convert 工具。
- MP4 和 MOV 使用 H.264 編碼，WebM 使用 VP9。
