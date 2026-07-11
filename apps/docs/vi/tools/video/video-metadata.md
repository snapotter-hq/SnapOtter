---
description: "Xóa metadata khỏi video và báo cáo những gì đã tìm thấy."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: bfe8c73c659d
---

# Clean Video Metadata {#clean-video-metadata}

Xóa metadata (ngày tạo, tọa độ GPS, model máy quay, thẻ phần mềm, v.v.) khỏi video và báo cáo những gì đã được xóa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Nhận multipart form data gồm một file video. Công cụ này không có cài đặt nào có thể cấu hình.

## Parameters {#parameters}

Công cụ này không có tham số nào. Nó xóa toàn bộ metadata khỏi container video.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- Metadata bị xóa bao gồm dấu thời gian tạo, dữ liệu GPS/vị trí, thông tin máy quay/thiết bị và thẻ phần mềm.
- Các luồng video và âm thanh được sao chép mà không mã hóa lại, nên không có mất mát chất lượng.
- Hữu ích cho quyền riêng tư trước khi chia sẻ video công khai.
