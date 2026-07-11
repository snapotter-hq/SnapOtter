---
description: "將影片片段轉換為動畫 GIF。"
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 9566f701d1ec
---

# Video to GIF {#video-to-gif}

將影片片段轉換為動畫 GIF，並可設定影格率、寬度、開始時間和時長。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | 輸出影格率（1-30） |
| width | integer | No | `480` | 輸出寬度（以像素為單位，64-1280）。高度會按比例縮放 |
| startS | number | No | `0` | 開始時間（以秒為單位，必須 >= 0） |
| durationS | number | No | `5` | 時長（以秒為單位，大於 0，最大 60） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 較低的 `fps` 和 `width` 值會產生較小的 GIF 檔案。480px 寬、12 fps 的 GIF 通常是不錯的平衡。
- 最大時長為 60 秒。較長的片段會產生非常大的檔案。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
