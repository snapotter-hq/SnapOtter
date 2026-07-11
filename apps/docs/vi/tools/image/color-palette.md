---
description: "Trích xuất các màu chủ đạo từ một ảnh dưới dạng bảng màu."
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: 990405553e21
---

# Bảng màu {#color-palette}

Trích xuất các màu chủ đạo từ một ảnh và trả về dưới dạng giá trị màu hex. Sử dụng phân tích tần suất lượng tử hóa để xác định những màu nổi bật nhất và khác biệt về mặt thị giác.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings` tùy chọn.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| count | integer | Không | `8` | Số màu cần trích xuất (2-16) |
| format | string | Không | `"hex"` | Định dạng màu: `hex`, `rgb`, `hsl` |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Các trường phản hồi {#response-fields}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| filename | string | Tên tệp đã được làm sạch |
| colors | array | Mảng các chuỗi màu theo định dạng yêu cầu, sắp xếp theo mức độ chủ đạo (nhiều nhất trước) |
| hex | array | Mảng các chuỗi màu hex (luôn là hex, bất kể thiết lập `format`) |
| count | number | Số màu đã trích xuất |

## Ghi chú {#notes}

- Trả về tối đa `count` màu chủ đạo (mặc định 8, khoảng 2-16), sắp xếp theo tần suất (phổ biến nhất trước).
- Ảnh được thay đổi kích thước nội bộ thành 100x100 pixel để phân tích, nên bảng màu thể hiện phân bố màu tổng thể thay vì các chi tiết nhỏ.
- Màu được trích xuất bằng lượng tử hóa cắt trung vị, phương pháp này chia đệ quy các nhóm pixel dọc theo kênh có dải rộng nhất.
- Kênh alpha được loại bỏ trước khi phân tích, nên các vùng trong suốt không được tính đến.
- Đây là endpoint chỉ đọc. Nó không tạo tệp đầu ra tải xuống được hay `jobId`.
- Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi phân tích.
