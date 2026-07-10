---
description: "Tối ưu ảnh cho phân phối web với chuyển đổi định dạng, kiểm soát chất lượng, thay đổi kích thước và loại bỏ metadata."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 2bb8d1313e7f
---

# Optimize for Web {#optimize-for-web}

Tối ưu ảnh cho phân phối web trong một bước duy nhất. Kết hợp chuyển đổi định dạng, điều chỉnh chất lượng, thay đổi kích thước tùy chọn, mã hóa lũy tiến và loại bỏ metadata.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Chấp nhận multipart form data với một tệp ảnh và một trường JSON `settings`.

Cũng có sẵn một endpoint xem trước trực tiếp tại `POST /api/v1/tools/image/optimize-for-web/preview`, trả về ảnh đã xử lý trực tiếp dưới dạng nhị phân (không tạo workspace) để tinh chỉnh tham số theo thời gian thực.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | Định dạng đầu ra: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | Chất lượng đầu ra (1-100) |
| maxWidth | number | No | - | Chiều rộng tối đa tính bằng pixel. Ảnh sẽ được thu nhỏ nếu rộng hơn. |
| maxHeight | number | No | - | Chiều cao tối đa tính bằng pixel. Ảnh sẽ được thu nhỏ nếu cao hơn. |
| progressive | boolean | No | `true` | Bật mã hóa lũy tiến/xen kẽ |
| stripMetadata | boolean | No | `true` | Loại bỏ metadata EXIF, GPS, ICC và XMP |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Tối ưu cho AVIF với nén mạnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

Endpoint xem trước (`/api/v1/tools/image/optimize-for-web/preview`) trả về ảnh nhị phân trực tiếp cùng với các header thông tin:

- `X-Original-Size` - Kích thước tệp gốc tính bằng byte
- `X-Processed-Size` - Kích thước tệp đã xử lý tính bằng byte
- `X-Output-Filename` - Tên tệp đầu ra đã mã hóa URL

## Notes {#notes}

- Công cụ này được thiết kế như một pipeline tối ưu một cửa cho tài nguyên web. Nó xử lý chuyển đổi định dạng, tinh chỉnh chất lượng, giới hạn kích thước tối đa và loại bỏ metadata trong một lượt duy nhất.
- Phần mở rộng tên tệp đầu ra được cập nhật để khớp với định dạng đã chọn.
- Mã hóa JXL (JPEG XL) sử dụng một bộ mã hóa CLI chuyên biệt. Ảnh trước tiên được xử lý dưới dạng PNG, sau đó mã hóa sang JXL.
- Mã hóa lũy tiến cải thiện thời gian tải cảm nhận cho JPEG và PNG bằng cách cho phép trình duyệt kết xuất bản xem trước chất lượng thấp trước khi ảnh đầy đủ tải xong.
- Endpoint xem trước nhẹ hơn (không tạo workspace/job) và dành cho giao diện tinh chỉnh tham số trực tiếp của frontend.
