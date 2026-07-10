---
description: "Kết hợp nhiều ảnh thành một lưới sprite sheet duy nhất kèm metadata khung hình."
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: db7a6243150c
---

# Sprite Sheet {#sprite-sheet}

Kết hợp nhiều ảnh thành một lưới sprite sheet duy nhất. Mỗi ảnh được đổi kích thước để khớp với kích thước của ảnh đầu tiên và đặt vào lưới. Trả về ảnh sprite sheet kèm metadata tọa độ của từng khung hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

Chấp nhận dữ liệu form multipart với hai ảnh trở lên và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| columns | integer | Không | `4` | Số cột trong lưới (1-16) |
| padding | integer | Không | `0` | Khoảng đệm giữa các ô tính bằng pixel (0-64) |
| background | string | Không | `"#ffffff"` | Màu nền dạng hex |
| format | string | Không | `"png"` | Định dạng đầu ra: `png`, `webp`, hoặc `jpeg` |
| quality | integer | Không | `90` | Chất lượng đầu ra (1-100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Ghi chú {#notes}

- Chấp nhận 2 đến 64 ảnh. Tất cả ảnh được đổi kích thước để khớp với kích thước của ảnh được tải lên đầu tiên.
- Mảng `frames` cung cấp tọa độ pixel chính xác của mỗi khung hình trong đầu ra, phù hợp cho định nghĩa CSS sprite hoặc bản đồ khung hình của game engine.
- Số hàng được tính tự động từ số lượng ảnh và giá trị `columns`.
- Dùng tham số `padding` để thêm khoảng cách giữa các ô. Màu `background` hiển thị ở các vùng đệm và bất kỳ ô trống thừa nào ở cuối.
- Đầu vào HEIC, RAW, PSD, và SVG được tự động giải mã trước khi xử lý.
