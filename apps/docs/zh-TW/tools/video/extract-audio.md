---
description: "從影片中取出音訊軌。"
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 83f38576dff2
---

# Extract Audio {#extract-audio}

從影片檔案中擷取音訊軌，並儲存為 MP3、WAV、M4A 或 OGG。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 輸出音訊格式：`mp3`、`wav`、`m4a`、`ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- 若影片沒有音訊軌，請求會回傳 400 錯誤。
- MP3 是有損格式但相容性廣泛。WAV 是無損格式但檔案較大。M4A（AAC）在品質和大小之間取得良好的平衡。OGG 可用於開放編解碼器工作流程。
- 當來源音訊已是 AAC 且輸出格式為 M4A 時，音訊串流會直接複製而不重新編碼。
