---
description: "Lấp đầy các thanh bằng một bản sao được làm mờ của video."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: ace4fdd6f723
---

# Blur Pad {#blur-pad}

Đưa một video vừa vào một tỷ lệ khung hình mục tiêu bằng cách lấp đầy vùng đệm bằng một bản sao được làm mờ, co giãn của video thay vì các thanh màu đơn sắc.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp video và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| target | string | Không | `"16:9"` | Tỷ lệ khung hình mục tiêu: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Không | `20` | Sigma làm mờ Gaussian cho nền (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Giá trị làm mờ cao hơn tạo ra nền mềm hơn, trừu tượng hơn. Giá trị thấp hơn giữ nhiều chi tiết hiển thị hơn.
- Nếu video đã khớp với tỷ lệ khung hình mục tiêu, tệp được trả về không thay đổi.
- Để có đệm màu đơn sắc, hãy dùng công cụ Aspect Pad thay thế.
