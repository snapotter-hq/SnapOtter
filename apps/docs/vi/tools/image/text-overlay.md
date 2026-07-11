---
description: "Thêm lớp phủ văn bản có kiểu dáng với bóng đổ và hộp nền."
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: c12bd34fb9bb
---

# Lớp phủ văn bản {#text-overlay}

Thêm văn bản có kiểu dáng vào ảnh với tùy chọn bóng đổ và hộp nền bán trong suốt. Phù hợp cho tiêu đề, chú thích, hoặc ghi chú trên ảnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| text | string | Có | - | Văn bản để phủ (1 đến 500 ký tự) |
| fontSize | number | Không | `48` | Cỡ chữ tính bằng pixel (8 đến 200) |
| color | string | Không | `"#FFFFFF"` | Màu chữ dạng hex (`#RRGGBB`) |
| position | string | Không | `"bottom"` | Vị trí theo chiều dọc: `top`, `center`, `bottom` |
| backgroundBox | boolean | Không | `false` | Hiển thị hình chữ nhật nền bán trong suốt phía sau văn bản |
| backgroundColor | string | Không | `"#000000"` | Màu hộp nền dạng hex (`#RRGGBB`) |
| shadow | boolean | Không | `true` | Áp dụng bóng đổ phía sau văn bản |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

Với một hộp nền:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Ghi chú {#notes}

- Văn bản luôn được căn giữa theo chiều ngang trong ảnh.
- Bóng đổ dùng độ lệch 2px với độ mờ 3px ở độ mờ đục màu đen 70%.
- Hộp nền trải rộng toàn bộ chiều rộng ảnh ở độ mờ đục 70%, với chiều cao tỷ lệ với cỡ chữ (1.8x).
- Văn bản được kết xuất qua composite SVG, nên font sans-serif mặc định của hệ thống được sử dụng.
- Các ký tự đặc biệt XML trong văn bản được escape an toàn.
- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD, và SVG được tự động giải mã trước khi xử lý.
