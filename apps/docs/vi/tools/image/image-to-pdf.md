---
description: "Kết hợp một hoặc nhiều ảnh thành tài liệu PDF với các tùy chọn kích thước trang, hướng và dung lượng tệp đích."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: c3fed2a16ab5
---

# Ảnh sang PDF {#image-to-pdf}

Kết hợp một hoặc nhiều ảnh thành tài liệu PDF. Hỗ trợ nhiều kích thước trang, hướng, lề và tùy chọn nhắm dung lượng tệp qua điều chỉnh chất lượng.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một hoặc nhiều tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| pageSize | string | Không | `"A4"` | Kích thước trang: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Không | `"portrait"` | Hướng trang: `portrait` hoặc `landscape` |
| margin | number | Không | `20` | Lề trang tính bằng point (0-500) |
| targetSize | object | Không | - | Ràng buộc dung lượng tệp đích (xem bên dưới) |
| collate | boolean | Không | `true` | Kết hợp tất cả ảnh vào một PDF. Nếu `false`, tạo một PDF cho mỗi ảnh. |

### Đối tượng Target Size {#target-size-object}

| Trường | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------------|
| value | number | Có | Giá trị kích thước đích |
| unit | string | Có | Đơn vị: `KB` hoặc `MB` |

Kích thước đích tối thiểu là 50 KB.

## Ví dụ yêu cầu {#example-request}

PDF nhiều ảnh cơ bản:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Với dung lượng tệp đích:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Một PDF cho mỗi ảnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Ví dụ phản hồi (Đã gộp) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Ví dụ phản hồi (Không gộp) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Ví dụ phản hồi (Với dung lượng đích) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Ghi chú {#notes}

- Ảnh được căn giữa trang và thu phóng để vừa trong lề trong khi giữ tỷ lệ khung hình. Ảnh không bao giờ được phóng to.
- Khi `collate` là `false`, mỗi ảnh trở thành một tệp PDF riêng, và bản tải xuống là một kho lưu trữ ZIP chứa tất cả các PDF.
- Tính năng dung lượng đích dùng tìm kiếm nhị phân lặp trên các mức chất lượng JPEG (10-95) để tìm chất lượng tốt nhất vừa với ngân sách.
- Ảnh trong suốt được làm phẳng thành trắng trước khi nhúng vào PDF.
- Các định dạng đầu vào được hỗ trợ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG và nhiều định dạng khác.
- Hướng EXIF được áp dụng tự động trước khi nhúng.
