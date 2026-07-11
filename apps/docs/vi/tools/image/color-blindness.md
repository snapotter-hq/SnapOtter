---
description: "Mô phỏng cách ảnh hiển thị với những người mắc các loại rối loạn sắc giác khác nhau."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: c6d920a27df4
---

# Mô phỏng mù màu {#color-blindness-simulation}

Mô phỏng rối loạn sắc giác (CVD) để xem trước cách ảnh hiển thị với những người mắc các loại mù màu khác nhau. Hữu ích cho việc kiểm thử khả năng tiếp cận của thiết kế, biểu đồ và giao diện.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| simulationType | string | Không | `"deuteranomaly"` | Loại rối loạn sắc giác cần mô phỏng |

### Các loại mô phỏng {#simulation-types}

| Giá trị | Tình trạng | Mô tả |
|-------|-----------|-------------|
| `protanopia` | Mù màu đỏ | Hoàn toàn không có tế bào nón đỏ |
| `deuteranopia` | Mù màu xanh lục | Hoàn toàn không có tế bào nón xanh lục |
| `tritanopia` | Mù màu xanh lam | Hoàn toàn không có tế bào nón xanh lam |
| `protanomaly` | Yếu màu đỏ | Giảm độ nhạy tế bào nón đỏ |
| `deuteranomaly` | Yếu màu xanh lục | Giảm độ nhạy tế bào nón xanh lục (phổ biến nhất) |
| `tritanomaly` | Yếu màu xanh lam | Giảm độ nhạy tế bào nón xanh lam |
| `achromatopsia` | Mù màu hoàn toàn | Hoàn toàn không có thị giác màu |
| `blueConeMonochromacy` | Chỉ có tế bào nón xanh lam | Chỉ tế bào nón xanh lam hoạt động |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Ghi chú {#notes}

- Chứng mù màu xanh lục nhẹ (yếu màu xanh lục) là mặc định vì đây là dạng rối loạn sắc giác phổ biến nhất, ảnh hưởng đến khoảng 6% nam giới.
- Việc mô phỏng sử dụng các ma trận biến đổi màu mô phỏng cách các tế bào cảm quang nón bị giảm hoặc mất làm thay đổi màu sắc cảm nhận được.
- Công cụ này không phá hủy dữ liệu và chỉ tạo bản xem trước. Nó không sửa đổi ảnh gốc để phục vụ khả năng tiếp cận.
- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi xử lý.
