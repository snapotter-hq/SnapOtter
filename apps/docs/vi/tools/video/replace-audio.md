---
description: "Thay track âm thanh của video bằng một file khác."
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: c7e7556e8aef
---

# Replace Audio {#replace-audio}

Thay track âm thanh của video bằng một file âm thanh. Tải lên cả một video và một file âm thanh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

Nhận multipart form data gồm chính xác hai file: một file video theo sau là một file âm thanh.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt nào. Tải lên một file video và một file âm thanh dưới dạng hai phần `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- Phải tải lên chính xác hai file: file đầu tiên phải là video, file thứ hai phải là file âm thanh.
- Nếu file âm thanh dài hơn video, nó được cắt để khớp với thời lượng video. Nếu ngắn hơn, phần video còn lại phát trong im lặng.
- Luồng video được sao chép mà không mã hóa lại, nên không có mất mát chất lượng video.
