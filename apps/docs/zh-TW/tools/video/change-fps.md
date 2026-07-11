---
description: "變更影片的影格率。"
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 19fe422d205e
---

# Change FPS {#change-fps}

將影片的影格率變更為介於 1 到 120 fps 之間的目標值。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | 目標影格率（1-120） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- 降低影格率會捨棄影格並縮小檔案大小。提高影格率會複製影格來填補空缺，但不會增加真實的動態細節。
- 常見的目標值：24（電影）、30（網路／廣播）、60（流暢播放）。
- 音訊軌會以其原始取樣率保留。
