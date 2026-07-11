---
description: "Phủ một logo hoặc ảnh làm watermark với vị trí, độ mờ đục, và tỷ lệ có thể cấu hình."
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: 557d2c411f40
---

# Watermark ảnh {#image-watermark}

Phủ một logo hoặc ảnh phụ làm watermark lên ảnh nền. Watermark được chia tỷ lệ tương đối theo chiều rộng ảnh nền và đặt ở góc hoặc giữa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

Chấp nhận dữ liệu form multipart với **hai** tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| position | string | Không | `"bottom-right"` | Vị trí watermark: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | Không | `50` | Phần trăm độ mờ đục watermark (0 đến 100) |
| scale | number | Không | `25` | Chiều rộng watermark tính theo phần trăm chiều rộng ảnh chính (1 đến 100) |

### Các trường tệp {#file-fields}

| Tên trường | Bắt buộc | Mô tả |
|------------|----------|-------------|
| file | Có | Ảnh chính/ảnh nền |
| watermark | Có | Ảnh watermark/logo |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Ghi chú {#notes}

- Cả hai ảnh đều được xác thực và giải mã (hỗ trợ HEIC, RAW, PSD, SVG).
- Watermark được đổi kích thước theo tỷ lệ sao cho chiều rộng của nó bằng `scale`% chiều rộng ảnh chính.
- Độ mờ đục được áp dụng qua một alpha mask được composite với hòa trộn `dest-in`.
- Các vị trí góc dùng khoảng đệm 20px từ cạnh ảnh.
- Nếu ảnh watermark có độ trong suốt (ví dụ logo PNG), nó được bảo toàn trong quá trình composite.
- Hướng EXIF được tự động áp dụng trên cả hai ảnh trước khi xử lý.
