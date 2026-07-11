---
description: "從影片中移除音訊軌。"
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 6bf2ce5d48c5
---

# Mute Video {#mute-video}

從影片中移除音訊軌，只保留視覺串流。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

接受包含一個影片檔案的 multipart form data。此工具沒有可設定的選項。

## Parameters {#parameters}

此工具沒有參數。它會從上傳的影片中移除音訊軌。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- 影片串流會直接複製而不重新編碼，因此不會有品質損失。
- 若輸入影片沒有音訊軌，檔案會原樣回傳。
