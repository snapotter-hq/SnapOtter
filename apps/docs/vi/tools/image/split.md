---
description: "Chia một ảnh thành các ô lưới theo hàng và cột hoặc theo kích thước pixel, trả về dưới dạng kho lưu trữ ZIP."
i18n_source_hash: 57a2e11e7cce
i18n_provenance: human
i18n_output_hash: b767a4ac891e
---

# Chia ảnh {#image-splitting}

Chia một ảnh đơn thành các ô lưới theo số cột/hàng hoặc theo kích thước pixel cụ thể. Trả về một kho lưu trữ ZIP chứa tất cả các ô.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| columns | integer | Không | 3 | Số cột để chia (1 đến 100) |
| rows | integer | Không | 3 | Số hàng để chia (1 đến 100) |
| tileWidth | integer | Không | - | Chiều rộng ô tính bằng pixel (tối thiểu 10). Ghi đè `columns` khi cả `tileWidth` và `tileHeight` đều được đặt. |
| tileHeight | integer | Không | - | Chiều cao ô tính bằng pixel (tối thiểu 10). Ghi đè `rows` khi cả `tileWidth` và `tileHeight` đều được đặt. |
| outputFormat | string | Không | `"original"` | Định dạng đầu ra cho các ô: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | Không | 90 | Chất lượng đầu ra cho các định dạng có mất dữ liệu (1 đến 100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Ví dụ Response {#example-response}

Response được truyền trực tiếp dưới dạng tệp ZIP với `Content-Type: application/zip`. Tên tệp theo mẫu `split-<jobId>.zip`.

Mỗi ô bên trong ZIP được đặt tên `<originalBaseName>_r<row>_c<col>.<ext>` (ví dụ `photo_r1_c1.png`, `photo_r2_c3.webp`).

## Ghi chú {#notes}

- Chấp nhận một tệp ảnh đơn.
- Hỗ trợ các định dạng đầu vào HEIC, RAW, PSD, và SVG (tự động giải mã).
- Khi cả `tileWidth` và `tileHeight` đều được cung cấp, chúng được ưu tiên hơn `columns`/`rows`. Kích thước lưới được tính là `ceil(imageWidth / tileWidth)` và `ceil(imageHeight / tileHeight)`.
- Các ô ở cạnh (cột ngoài cùng bên phải, hàng dưới cùng) có thể nhỏ hơn kích thước ô được chỉ định nếu kích thước ảnh không chia hết.
- Kích thước lưới tối đa được giới hạn ở 100x100 (10.000 ô).
- Response truyền trực tiếp tệp ZIP nên không có thân JSON. Dùng `--output` với curl để lưu tệp.
