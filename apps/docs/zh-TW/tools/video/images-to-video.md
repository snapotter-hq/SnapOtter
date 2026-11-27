---
description: "將一組圖片變成幻燈片影片、動畫 GIF 或動畫 WebP。"
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: d100170f08a6
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

將一組圖片變成幻燈片影片,並可設定每張圖片的顯示時長、解析度和影格率;也可以變成動畫 GIF 或 WebP,並設定每個影格的時間與循環次數。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

接受包含兩個或以上圖片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | 輸出格式:`mp4`、`gif`、`webp` |
| secondsPerImage | number | No | `2` | 僅限 MP4。每張圖片的顯示時長(以秒為單位,0.5-10) |
| resolution | string | No | `"720p"` | 僅限 MP4。輸出解析度:`1080p`、`720p`、`square` |
| fps | integer | No | `30` | 僅限 MP4。輸出影格率(10-60) |
| frameDelayMs | integer | No | `500` | 僅限 GIF 與 WebP。每張圖片的顯示時間(以毫秒為單位,20-10000) |
| loop | integer | No | `0` | 僅限 GIF 與 WebP。動畫播放的次數;`0` 表示無限循環(0-100) |

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

建立每張圖片顯示 200 毫秒的動畫 GIF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- 對於 MP4,圖片會在保留長寬比的前提下,調整大小並加上填充以符合目標解析度。
- `square` 解析度選項會產生 1080x1080 的影片,適用於社群媒體。
- MP4 輸出為 H.264,檔名為 `slideshow.mp4`。
- GIF 與 WebP 輸出會採用第一張圖片的尺寸。其他尺寸的圖片會縮放至該尺寸內,剩餘區域為透明。檔名為 `slideshow.gif` 或 `slideshow.webp`。
- GIF 以百分之一秒為單位儲存影格時間,因此在 GIF 中 `frameDelayMs` 會四捨五入到最接近的 10 毫秒。WebP 則保留精確值。
- 過大的動畫會被拒絕而不會建立:影格尺寸乘以圖片數量,必須維持在 GIF 工具所用的同一個像素上限之下。
