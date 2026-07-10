---
description: "在 MP4、MOV、WebM、AVI 和 MKV 之間轉換影片。"
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 7d4733c9c797
---

# Convert Video {#convert-video}

在 MP4、MOV、WebM、AVI 和 MKV 格式之間轉換影片，並可設定品質預設。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | 輸出格式：`mp4`、`mov`、`webm`、`avi`、`mkv` |
| quality | string | No | `"balanced"` | 品質預設：`high`、`balanced`、`small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` 品質預設會產生最佳的視覺保真度，但檔案較大。`small` 預設則會積極壓縮以取得最小的檔案大小。
- WebM 輸出使用 VP9 編碼。MP4 和 MOV 使用 H.264。AVI 和 MKV 可用於舊有或封存工作流程。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
