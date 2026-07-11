---
description: "將字幕軌混流到影片容器中。"
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 8e0aaddba20c
---

# Embed Subtitles {#embed-subtitles}

將字幕檔案混流到影片容器中，作為觀看者可自行開啟或關閉的軟字幕軌。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

接受包含一個影片檔案和一個字幕檔案，以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B 語言代碼（3 個小寫字母，例如 `"eng"`、`"fra"`、`"deu"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- 上傳兩個檔案：第一個必須是影片，第二個必須是字幕檔案（.srt、.vtt 或 .ass）。
- 觀看者可在其媒體播放器中切換嵌入的（軟）字幕。若需要永久可見的字幕，請改用 Burn Subtitles 工具。
- 語言代碼會以中繼資料的形式儲存在容器中，有助於媒體播放器標記字幕軌。
