---
description: "Loại bỏ track âm thanh khỏi video."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 9cad30dc4363
---

# Mute Video {#mute-video}

Loại bỏ track âm thanh khỏi video, chỉ để lại luồng hình ảnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Nhận multipart form data gồm một file video. Công cụ này không có cài đặt nào có thể cấu hình.

## Parameters {#parameters}

Công cụ này không có tham số nào. Nó tách track âm thanh khỏi video được tải lên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Luồng video được sao chép mà không mã hóa lại, nên không có mất mát chất lượng.
- Nếu video đầu vào không có track âm thanh, file được trả về không thay đổi.
