---
description: "Ghép ảnh cạnh nhau, xếp chồng, hoặc theo lưới với kiểm soát căn chỉnh, khoảng cách, viền, và chế độ đổi kích thước."
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 43e42bf99bdb
---

# Ghép nối ảnh {#stitch-combine}

Ghép nhiều ảnh cạnh nhau, xếp chồng theo chiều dọc, hoặc sắp xếp theo lưới. Hỗ trợ căn chỉnh, khoảng cách, viền, bo góc, và nhiều chế độ đổi kích thước.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| direction | string | Không | `"horizontal"` | Hướng bố cục: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | Không | 2 | Số cột khi direction là `grid` (2 đến 100) |
| resizeMode | string | Không | `"fit"` | Cách đổi kích thước ảnh: `fit`, `original`, `stretch`, `crop` |
| alignment | string | Không | `"center"` | Căn chỉnh theo trục chéo: `start`, `center`, `end` |
| gap | number | Không | 0 | Khoảng cách giữa các ảnh tính bằng pixel (0 đến 1000) |
| border | number | Không | 0 | Độ rộng viền ngoài tính bằng pixel (0 đến 500) |
| cornerRadius | number | Không | 0 | Bán kính bo góc áp dụng cho đầu ra cuối (0 đến 500) |
| backgroundColor | string | Không | `"#FFFFFF"` | Màu nền/viền dạng hex (ví dụ `#FF0000`) |
| format | string | Không | `"png"` | Định dạng đầu ra: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Không | 90 | Chất lượng đầu ra (1 đến 100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Ghi chú {#notes}

- Yêu cầu ít nhất 2 ảnh. Tải lên nhiều tệp ảnh trong request multipart.
- Hỗ trợ các định dạng đầu vào HEIC, RAW, PSD, và SVG (tự động giải mã).
- Các chế độ đổi kích thước:
  - `fit` - Chia tỷ lệ ảnh để khớp với kích thước nhỏ nhất dọc theo trục ghép.
  - `original` - Giữ nguyên kích thước gốc (có thể tạo ra cạnh không đều).
  - `stretch` - Buộc ảnh khớp với kích thước nhỏ nhất mà không giữ tỷ lệ khung hình.
  - `crop` - Cắt kiểu cover để ảnh khớp với kích thước nhỏ nhất.
- Ở chế độ `grid`, các ô được đặt kích thước theo kích thước trung vị của tất cả ảnh.
- `cornerRadius` được áp dụng cho toàn bộ đầu ra cuối cùng, không phải từng ảnh riêng lẻ.
- Kích thước canvas bị giới hạn bởi cấu hình máy chủ `MAX_CANVAS_PIXELS` để ngăn cạn kiệt bộ nhớ.
