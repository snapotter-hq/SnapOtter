---
description: "將多個影片片段合併為一個檔案。"
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: d27fda098d78
---

# Merge Videos {#merge-videos}

將多個影片片段合併為單一 MP4 檔案。所有輸入都會正規化為第一段影片的解析度和 30 fps。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

接受包含兩個或以上影片檔案的 multipart form data。這是一個非同步端點，它會立即回傳 `202 Accepted`，進度則透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 串流傳送。

## Parameters {#parameters}

此工具沒有設定參數。以多個 `file` 部分上傳 2-10 個影片檔案。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 片段會依上傳順序串接。
- 所有片段都會重新編碼，以符合第一段片段的解析度、影格率（30 fps）和編解碼器（H.264）。不一致的輸入會自動正規化。
- 每次請求接受 2-10 個影片檔案。
- 在工作完成之前，可透過 SSE 於 `GET /api/v1/jobs/{jobId}/progress` 取得進度更新。
