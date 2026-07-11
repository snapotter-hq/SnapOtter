---
description: "Ghép một track phụ đề vào container video."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 0c0843db5789
---

# Embed Subtitles {#embed-subtitles}

Ghép một file phụ đề vào container video dưới dạng track phụ đề mềm mà người xem có thể bật hoặc tắt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Nhận multipart form data gồm một file video và một file phụ đề, cùng với một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Mã ngôn ngữ ISO 639-2/B (3 chữ cái thường, ví dụ `"eng"`, `"fra"`, `"deu"`) |

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

- Tải lên hai file: file đầu tiên phải là video, file thứ hai phải là file phụ đề (.srt, .vtt hoặc .ass).
- Phụ đề nhúng (mềm) có thể được người xem bật/tắt trong trình phát media của họ. Để có phụ đề luôn hiển thị vĩnh viễn, hãy dùng công cụ Burn Subtitles.
- Mã ngôn ngữ được lưu dưới dạng metadata trong container và giúp các trình phát media gắn nhãn track phụ đề.
