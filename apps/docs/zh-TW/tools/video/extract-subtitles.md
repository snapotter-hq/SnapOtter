---
description: "將影片中的字幕軌以 SRT、WebVTT 或 ASS 檔案形式取出。"
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 394a9b38794b
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

從影片容器中擷取嵌入的字幕軌，並以 SRT、WebVTT 或 ASS 檔案的形式下載。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

接受包含一個影片檔案及選用 `settings` JSON 字串的 multipart form data。

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | 輸出格式：`srt`、`vtt`（WebVTT）或 `ass` |

會擷取影片容器中找到的第一個字幕軌。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- 影片必須包含嵌入的字幕軌。若找不到字幕軌，請求會回傳 400 錯誤。
- 若影片有多個字幕軌，則會擷取第一個。
- 文字字幕軌（SubRip、ASS、mov_text、WebVTT）可轉換為三種輸出格式中的任一種。將 ASS 字幕軌轉換為 SRT 或 WebVTT 會捨棄其定位與特效。
- 以影像為基礎的字幕軌（Blu-ray PGS、DVD VobSub）不經 OCR 無法轉為文字，會回傳 422 錯誤。
