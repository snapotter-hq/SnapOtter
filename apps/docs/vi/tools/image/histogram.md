---
description: "Tạo biểu đồ histogram RGB với thống kê theo từng kênh từ một ảnh."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: bf9854df5196
---

# Histogram {#histogram}

Tạo biểu đồ histogram RGB từ một ảnh. Trả về một ảnh histogram PNG cùng với thống kê theo từng kênh và dữ liệu histogram thô 256 bin trong JSON phản hồi.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| scale | string | Không | `"linear"` | Thang trục Y: `linear` hoặc `log` |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Ghi chú {#notes}

- `downloadUrl` trỏ tới một biểu đồ histogram PNG đã kết xuất cho thấy phân bố của R, G, B và độ sáng (luminance).
- `bins` chứa các mảng thô 256 giá trị cho mỗi kênh (đỏ, lục, lam, độ sáng), phù hợp để kết xuất các biểu diễn tùy chỉnh.
- `stats` cung cấp giá trị trung bình, trung vị và độ lệch chuẩn cho mỗi kênh.
- `mean` và `max` là các trường viết tắt tương thích ngược.
- Dùng thang `log` khi histogram bị chi phối bởi một vài đỉnh và bạn muốn thấy chi tiết ở các bin thấp hơn.
- Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi phân tích.
