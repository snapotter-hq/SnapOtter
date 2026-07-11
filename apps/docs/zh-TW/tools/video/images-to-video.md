---
description: "將一組圖片變成幻燈片影片。"
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 873816ebcc4e
---

# Images to Video {#images-to-video}

將一組圖片變成幻燈片影片，並可設定每張圖片的顯示時長、解析度和影格率。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

接受包含兩個或以上圖片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | 每張圖片的顯示時長（以秒為單位，0.5-10） |
| resolution | string | No | `"720p"` | 輸出解析度：`1080p`、`720p`、`square` |
| fps | integer | No | `30` | 輸出影格率（10-60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- 每次請求接受 2-60 個圖片檔案。圖片會依上傳順序出現在影片中。
- 圖片會在保留長寬比的前提下，調整大小並加上填充以符合目標解析度。
- `square` 解析度選項會產生 1080x1080 的影片，適用於社群媒體。
- 輸出格式一律為 MP4（H.264）。
