---
description: "Chuyển đổi GIF động sang WebP và ngược lại, giữ nguyên tất cả khung hình."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: f61f6aa15ce7
---

# Trình chuyển đổi GIF/WebP {#gif-webp-converter}

Chuyển đổi tệp GIF động sang WebP và ngược lại, giữ nguyên tất cả khung hình và thời gian hoạt ảnh. Hoạt ảnh WebP thường nhỏ hơn 25-35% so với GIF tương đương.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp GIF hoặc WebP và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| quality | integer | Không | `80` | Chất lượng đầu ra khi mã hóa WebP (1-100) |
| lossless | boolean | Không | `false` | Dùng nén WebP không mất dữ liệu |
| resizePercent | integer | Không | `100` | Thu phóng đầu ra theo phần trăm (10-100) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Ghi chú {#notes}

- Chỉ chấp nhận tệp `.gif` và `.webp`. Các định dạng ảnh khác không được công cụ này hỗ trợ.
- Chiều chuyển đổi là tự động: đầu vào GIF tạo ra đầu ra WebP, và đầu vào WebP tạo ra đầu ra GIF.
- Các tùy chọn `quality` và `lossless` chỉ áp dụng khi mã hóa sang WebP. Khi chuyển sang GIF, đầu ra dùng bảng màu GIF tiêu chuẩn.
- Dùng `resizePercent` để giảm kích thước (và dung lượng tệp) của các hoạt ảnh lớn.
