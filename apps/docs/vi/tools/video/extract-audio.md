---
description: "Tách track âm thanh ra khỏi video."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 0fde41386c51
---

# Extract Audio {#extract-audio}

Trích xuất track âm thanh từ một file video và lưu dưới dạng MP3, WAV, M4A hoặc OGG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Định dạng âm thanh đầu ra: `mp3`, `wav`, `m4a`, `ogg` |

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

- Nếu video không có track âm thanh, yêu cầu trả về lỗi 400.
- MP3 có mất dữ liệu nhưng tương thích rộng rãi. WAV không mất dữ liệu nhưng lớn. M4A (AAC) mang lại sự cân bằng tốt giữa chất lượng và kích thước. OGG có sẵn cho các quy trình dùng codec mở.
- Khi âm thanh nguồn đã là AAC và định dạng đầu ra là M4A, luồng âm thanh được sao chép mà không mã hóa lại.
