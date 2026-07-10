---
description: "Phát ngược một clip video."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 26e70b4998ec
---

# Reverse Video {#reverse-video}

Phát ngược một clip video. Track âm thanh cũng được đảo ngược.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Nhận multipart form data gồm một file video. Công cụ này không có cài đặt nào có thể cấu hình.

## Parameters {#parameters}

Công cụ này không có tham số nào. Nó đảo ngược toàn bộ video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Giới hạn ở các clip dài tối đa 5 phút. Các video dài hơn bị từ chối với lỗi 400.
- Cả track video và âm thanh đều được đảo ngược. Để đảo ngược video mà không có âm thanh, hãy mute nó trước.
