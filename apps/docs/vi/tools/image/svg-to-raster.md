---
description: "Chuyển tệp SVG sang PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, hoặc JXL ở độ phân giải và DPI tùy chỉnh, có hỗ trợ hàng loạt."
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 77ab1ea3e6c4
---

# SVG sang Raster {#svg-to-raster}

Chuyển tệp SVG sang các định dạng ảnh raster (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, hoặc JXL) ở độ phân giải và DPI tùy chỉnh. Cũng hỗ trợ chuyển đổi hàng loạt nhiều SVG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| width | integer | Không | - | Chiều rộng đích tính bằng pixel (1 đến 65536). Giữ tỷ lệ khung hình nếu chỉ đặt một chiều. |
| height | integer | Không | - | Chiều cao đích tính bằng pixel (1 đến 65536). Giữ tỷ lệ khung hình nếu chỉ đặt một chiều. |
| dpi | integer | Không | 300 | DPI kết xuất, kiểm soát mật độ raster hóa cơ bản (36 đến 2400) |
| quality | number | Không | 90 | Chất lượng đầu ra cho các định dạng có mất dữ liệu (1 đến 100) |
| backgroundColor | string | Không | `"#00000000"` | Màu nền dạng hex (6 hoặc 8 ký tự, dạng 8 ký tự bao gồm alpha) |
| outputFormat | string | Không | `"png"` | Định dạng đầu ra: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Endpoint hàng loạt {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

Chuyển đổi nhiều tệp SVG trong một request. Trả về một kho lưu trữ ZIP.

### Tham số hàng loạt bổ sung {#additional-batch-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| clientJobId | string | Không | - | ID công việc do client cung cấp tùy chọn để theo dõi tiến trình (tối đa 128 ký tự) |

### Ví dụ Request hàng loạt {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Response hàng loạt {#batch-response}

Endpoint hàng loạt truyền trực tiếp một tệp ZIP với các header:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Ghi chú {#notes}

- Chỉ chấp nhận tệp SVG và SVGZ (xác thực nội dung, không chỉ phần mở rộng). SVGZ được tự động giải nén.
- Nội dung SVG được làm sạch trước khi kết xuất để ngăn XSS và tải tài nguyên bên ngoài.
- Thiết lập `dpi` kiểm soát mật độ mà SVG được raster hóa. DPI cao hơn tạo ra kích thước pixel lớn hơn từ cùng một viewport SVG.
- Khi cả `width` và `height` đều được cung cấp, ảnh được đổi kích thước bằng `fit: inside` (giữ tỷ lệ khung hình trong giới hạn).
- Một `previewUrl` được bao gồm trong response cho các định dạng mà trình duyệt không thể hiển thị trực tiếp (TIFF, HEIF). Bản xem trước là thumbnail WebP 1200px.
- `#00000000` nền mặc định là hoàn toàn trong suốt. Đặt thành `#FFFFFF` cho nền trắng (hữu ích với đầu ra JPEG vốn không hỗ trợ độ trong suốt).
- Xử lý hàng loạt tuân theo cấu hình máy chủ `MAX_BATCH_SIZE` và sử dụng các worker đồng thời để tăng hiệu suất.
- Tiến trình của các thao tác hàng loạt có thể được theo dõi qua SSE tại `/api/v1/jobs/:jobId/progress`.
