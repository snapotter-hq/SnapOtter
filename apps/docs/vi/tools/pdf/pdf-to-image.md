---
description: "Chuyển đổi các trang PDF thành hình ảnh chất lượng cao."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 078d2337fd2a
---

# PDF to Image {#pdf-to-image}

Chuyển đổi các trang PDF thành hình ảnh raster chất lượng cao. Hỗ trợ chọn trang, nhiều định dạng đầu ra, điều khiển DPI và chế độ màu. Bao gồm các tuyến con info và preview để kiểm tra PDF trước khi chuyển đổi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| format | string | Không | `"png"` | Định dạng đầu ra: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Không | 150 | Độ phân giải kết xuất (36 đến 2400). DPI cao hơn tạo ra hình ảnh lớn hơn, chi tiết hơn. |
| quality | number | Không | 85 | Chất lượng đầu ra cho các định dạng có mất mát (1 đến 100) |
| colorMode | string | Không | `"color"` | Chế độ màu: `color`, `grayscale`, `bw` (ngưỡng đen trắng) |
| pages | string | Không | `"all"` | Chọn trang: `all`, một trang (`3`), phạm vi (`1-5`), hoặc ngăn cách bằng dấu phẩy (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Trả về số trang của một PDF mà không kết xuất bất kỳ trang nào.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Trả về hình thu nhỏ JPEG độ phân giải thấp của tất cả các trang dưới dạng URL dữ liệu base64. Hữu ích để xây dựng giao diện chọn trang.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Dùng MuPDF để kết xuất PDF, mang lại đầu ra trung thực cao với kết xuất phông chữ và đồ họa vector chính xác.
- Các PDF được bảo vệ bằng mật khẩu không được hỗ trợ và sẽ trả về lỗi 400.
- Tham số `pages` hỗ trợ cú pháp linh hoạt:
  - `"all"` hoặc `""` - tất cả các trang
  - `"3"` - một trang
  - `"1-5"` - phạm vi trang (bao gồm cả hai đầu)
  - `"1,3,5-8"` - kết hợp các trang riêng lẻ và phạm vi
- Số trang bắt đầu từ 1. Chỉ định các trang vượt quá độ dài tài liệu sẽ trả về lỗi 400.
- Endpoint chính luôn tạo cả các tệp tải xuống trang riêng lẻ và một tệp ZIP chứa tất cả các trang đã chọn.
- Endpoint preview kết xuất ở 72 DPI và co giãn đến chiều rộng 300px để tạo hình thu nhỏ nhanh. Hình thu nhỏ là JPEG ở chất lượng 60%.
- Endpoint preview tôn trọng cấu hình máy chủ `MAX_PDF_PAGES`, giới hạn số lượng hình thu nhỏ được tạo.
- Đối với tài liệu lớn ở DPI cao, thời gian xử lý tăng theo tỷ lệ. Hãy cân nhắc dùng DPI thấp hơn (150) cho mục đích sử dụng web và DPI cao hơn (300-600) cho in ấn.
