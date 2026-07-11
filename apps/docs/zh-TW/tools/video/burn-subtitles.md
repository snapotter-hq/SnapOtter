---
description: "將字幕永久燒錄到影片畫面上。"
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: 98e68c301be3
---

# Burn Subtitles {#burn-subtitles}

將 SRT、VTT 或 ASS 檔案中的字幕永久渲染（硬編碼）到影片的每一個畫面上。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

接受包含一個影片檔案和一個字幕檔案的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | 字幕字型大小（以像素為單位，8-72） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 上傳兩個檔案：第一個必須是影片，第二個必須是字幕檔案（.srt、.vtt 或 .ass）。
- 燒錄的字幕會永久成為影片的一部分，觀看者無法將其關閉。若需要可切換的字幕，請改用 Embed Subtitles 工具。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
