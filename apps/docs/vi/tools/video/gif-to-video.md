---
description: "Chuyển đổi ảnh GIF động thành video MP4, WebM hoặc MOV."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: cc47385043bb
---

# GIF to Video {#gif-to-video}

Chuyển đổi ảnh GIF động thành file video MP4, WebM hoặc MOV gọn nhẹ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Nhận multipart form data gồm một file GIF và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Định dạng đầu ra: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- Chuyển đổi GIF sang video thường giảm kích thước file 80-90% trong khi vẫn giữ nguyên chất lượng hình ảnh.
- Chỉ chấp nhận file GIF động. Ảnh tĩnh nên dùng công cụ Convert của hình ảnh.
- MP4 và MOV dùng mã hóa H.264, WebM dùng VP9.
