---
description: "Chuẩn hóa âm lượng của video theo tiêu chuẩn phát sóng."
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 863140216785
---

# Chuẩn hóa âm thanh video {#normalize-audio}

Chuẩn hóa âm lượng âm thanh của video theo tiêu chuẩn độ ồn phát sóng EBU R128.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Nhận multipart form data gồm một file video. Công cụ này không có cài đặt nào có thể cấu hình.

## Parameters {#parameters}

Công cụ này không có tham số nào. Nó áp dụng chuẩn hóa độ ồn EBU R128 cho track âm thanh.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- Dùng bộ lọc `loudnorm` của FFmpeg nhắm tới độ ồn tích hợp -16 LUFS với đỉnh thực -1.5 dBTP và dải độ ồn 11 LU (tiêu chuẩn phát sóng EBU R128).
- Tốc độ lấy mẫu âm thanh nguồn được giữ nguyên ở đầu ra.
- Nếu video không có track âm thanh, yêu cầu trả về lỗi 400.
