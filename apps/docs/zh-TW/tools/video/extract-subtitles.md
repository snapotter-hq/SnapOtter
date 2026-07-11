---
description: "從影片中取出字幕軌並儲存為 SRT 檔案。"
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: c6d767bd995c
---

# Extract Subtitles {#extract-subtitles}

從影片容器中擷取嵌入的字幕軌，並以 SRT 檔案的形式下載。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

接受包含一個影片檔案的 multipart form data。此工具沒有可設定的選項。

## Parameters {#parameters}

此工具沒有參數。它會擷取影片容器中找到的第一個字幕軌。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 影片必須包含嵌入的字幕軌。若找不到字幕軌，請求會回傳 400 錯誤。
- 若影片有多個字幕軌，則會擷取第一個。
- 無論容器中的原始字幕格式為何，輸出格式一律為 SRT。
