---
description: "Xem siêu dữ liệu ảnh chi tiết, các thuộc tính và thống kê histogram theo từng kênh."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: 81275c460093
---

# Thông tin ảnh {#image-info}

Công cụ phân tích chỉ đọc trả về siêu dữ liệu ảnh toàn diện bao gồm kích thước, định dạng, không gian màu, sự hiện diện của EXIF/ICC/XMP, và thống kê histogram theo từng kênh. Không tạo ra tệp đầu ra đã xử lý.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/info`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp ảnh. Không cần trường cài đặt.

## Tham số {#parameters}

Công cụ này không có tham số cấu hình được. Chỉ cần tải lên tệp ảnh.

| Trường | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------------|
| file | file | Có | Ảnh cần phân tích |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Ví dụ phản hồi {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Trường phản hồi {#response-fields}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| filename | string | Tên tệp đã được làm sạch |
| fileSize | number | Kích thước tệp tính bằng byte |
| width | number | Chiều rộng ảnh tính bằng pixel |
| height | number | Chiều cao ảnh tính bằng pixel |
| format | string | Định dạng được phát hiện (jpeg, png, webp, v.v.) |
| channels | number | Số kênh màu |
| hasAlpha | boolean | Ảnh có kênh alpha hay không |
| colorSpace | string | Không gian màu (srgb, cmyk, v.v.) |
| density | number hoặc null | Độ phân giải DPI/PPI |
| isProgressive | boolean | JPEG có dùng mã hóa progressive hay không |
| orientation | number hoặc null | Giá trị hướng EXIF (1-8) |
| hasProfile | boolean | Có nhúng hồ sơ ICC hay không |
| hasExif | boolean | Có siêu dữ liệu EXIF hay không |
| hasIcc | boolean | Có hồ sơ màu ICC hay không |
| hasXmp | boolean | Có siêu dữ liệu XMP hay không |
| bitDepth | string hoặc null | Số bit trên mỗi mẫu |
| pages | number | Số trang (cho các định dạng nhiều trang như TIFF, GIF) |
| histogram | array | Thống kê theo từng kênh (min, max, mean, độ lệch chuẩn) |

## Ghi chú {#notes}

- Đây là một điểm cuối chỉ đọc. Nó không tạo ra tệp đầu ra có thể tải xuống hoặc một `jobId`.
- Với ảnh định dạng RAW (DNG, CR2, NEF, ARW, v.v.), ExifTool được dùng để trích xuất kích thước cảm biến thực và các cờ siêu dữ liệu mà Sharp không thể đọc trực tiếp.
- Các tệp HEIC/HEIF được giải mã thành PNG nội bộ để trích xuất thống kê pixel, vì Sharp không thể giải mã pixel HEVC.
- Histogram cung cấp min/max/mean/stdev cho mỗi kênh, không phải phân bố đầy đủ 256 bin.
- Trường `density` phản ánh siêu dữ liệu DPI được nhúng, nếu có.
