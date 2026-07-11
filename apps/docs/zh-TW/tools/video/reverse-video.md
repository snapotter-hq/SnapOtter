---
description: "倒轉播放影片片段。"
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: aafd7dd1ba0c
---

# Reverse Video {#reverse-video}

倒轉播放影片片段。音訊軌也會一併倒轉。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

接受包含一個影片檔案的 multipart form data。此工具沒有可設定的選項。

## Parameters {#parameters}

此工具沒有參數。它會倒轉整段影片。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- 限制片段長度不超過 5 分鐘。較長的影片會被拒絕並回傳 400 錯誤。
- 影片和音訊軌都會被倒轉。若要在不倒轉音訊的情況下倒轉影片，請先將其靜音。
