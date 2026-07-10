---
description: "Tách track phụ đề ra khỏi video dưới dạng file SRT."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: a2556b59979b
---

# Extract Subtitles {#extract-subtitles}

Trích xuất track phụ đề nhúng từ một container video và tải xuống dưới dạng file SRT.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Nhận multipart form data gồm một file video. Công cụ này không có cài đặt nào có thể cấu hình.

## Parameters {#parameters}

Công cụ này không có tham số nào. Nó trích xuất track phụ đề đầu tiên tìm thấy trong container video.

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

- Video phải chứa một track phụ đề nhúng. Nếu không tìm thấy track phụ đề nào, yêu cầu trả về lỗi 400.
- Nếu video có nhiều track phụ đề, track đầu tiên sẽ được trích xuất.
- Định dạng đầu ra là SRT bất kể định dạng phụ đề gốc trong container là gì.
