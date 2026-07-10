---
description: "從影片中移除中繼資料，並回報找到的內容。"
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 977d877207fb
---

# Clean Video Metadata {#clean-video-metadata}

從影片中移除中繼資料（建立日期、GPS 座標、相機型號、軟體標籤等），並回報移除了哪些內容。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

接受包含一個影片檔案的 multipart form data。此工具沒有可設定的選項。

## Parameters {#parameters}

此工具沒有參數。它會移除影片容器中的所有中繼資料。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- 移除的中繼資料包括建立時間戳記、GPS／位置資料、相機／裝置資訊和軟體標籤。
- 影片和音訊串流會直接複製而不重新編碼，因此不會有品質損失。
- 適用於在公開分享影片前保護隱私。
