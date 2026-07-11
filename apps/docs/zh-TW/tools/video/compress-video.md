---
description: "透過品質控制縮小影片檔案大小。"
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: d17464ca5f60
---

# Compress Video {#compress-video}

使用可設定的壓縮強度和選用的解析度縮放，縮小影片檔案大小。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | 壓縮強度：`light`、`balanced`、`strong` |
| resolution | string | No | `"original"` | 輸出解析度：`original`、`1080p`、`720p`、`480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` 預設會保留接近原始的品質。`strong` 預設則會積極縮小檔案大小，代價是視覺保真度。
- 縮小解析度（例如從 4K 降到 720p）會與壓縮相互疊加，達到顯著的體積縮減。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
