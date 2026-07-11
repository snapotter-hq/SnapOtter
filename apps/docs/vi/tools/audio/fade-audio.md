---
description: "Thêm hiệu ứng fade-in và fade-out cho âm thanh."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: bab20ee78541
---

# Làm mờ âm thanh {#fade-audio}

Thêm hiệu ứng fade-in và fade-out vào phần đầu và phần cuối của một tệp âm thanh.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Chấp nhận dữ liệu form multipart với một tệp âm thanh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Không | `1` | Thời lượng fade-in tính bằng giây (0 đến 30) |
| fadeOutS | number | Không | `1` | Thời lượng fade-out tính bằng giây (0 đến 30) |

## Yêu cầu ví dụ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## Phản hồi ví dụ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Ghi chú {#notes}

- Đặt một trong hai giá trị thành `0` để bỏ qua hướng fade đó. Ít nhất một giá trị phải lớn hơn 0.
- Thời lượng fade được giới hạn theo độ dài âm thanh nếu vượt quá.
- Đầu ra thường giữ container đầu vào. Đầu vào AAC được ghi thành M4A, và các đầu vào chỉ giải mã không được hỗ trợ sẽ chuyển về MP3.
