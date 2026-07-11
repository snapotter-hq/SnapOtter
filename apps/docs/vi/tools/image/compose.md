---
description: "Xếp lớp ảnh với vị trí, độ mờ và chế độ hòa trộn để ghép ảnh."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 80ff82bb471b
---

# Ghép lớp ảnh {#image-composition}

Xếp một ảnh phủ lên trên một ảnh nền với vị trí, độ mờ và chế độ hòa trộn cấu hình được. Hữu ích để ghép logo, đồ họa hoặc kết hợp nhiều ảnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

Chấp nhận dữ liệu form multipart với **hai** tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| x | number | Không | `0` | Độ lệch ngang của ảnh phủ so với góc trên bên trái tính bằng pixel (tối thiểu 0) |
| y | number | Không | `0` | Độ lệch dọc của ảnh phủ so với góc trên bên trái tính bằng pixel (tối thiểu 0) |
| opacity | number | Không | `100` | Phần trăm độ mờ của ảnh phủ (0 đến 100) |
| blendMode | string | Không | `"over"` | Chế độ hòa trộn khi ghép |

### Các chế độ hòa trộn {#blend-modes}

| Giá trị | Mô tả |
|-------|-------------|
| `over` | Phủ thông thường (mặc định) |
| `multiply` | Làm tối bằng cách nhân giá trị pixel |
| `screen` | Làm sáng bằng cách đảo, nhân rồi đảo lại |
| `overlay` | Kết hợp multiply và screen dựa trên độ sáng của ảnh nền |
| `darken` | Giữ pixel tối hơn từ mỗi lớp |
| `lighten` | Giữ pixel sáng hơn từ mỗi lớp |
| `hard-light` | Phủ tương phản mạnh |
| `soft-light` | Phủ tương phản nhẹ |
| `difference` | Chênh lệch tuyệt đối giữa các lớp |
| `exclusion` | Tương tự difference nhưng tương phản thấp hơn |

### Các trường tệp {#file-fields}

| Tên trường | Bắt buộc | Mô tả |
|------------|----------|-------------|
| file | Có | Ảnh nền/hậu cảnh |
| overlay | Có | Ảnh phủ/tiền cảnh |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Sử dụng chế độ hòa trộn multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Ghi chú {#notes}

- Cả hai ảnh được xác thực và giải mã (hỗ trợ HEIC, RAW, PSD, SVG) trước khi ghép.
- Ảnh phủ được đặt tại đúng tọa độ pixel chỉ định bởi `x` và `y`. Nó không được thay đổi kích thước để vừa khít.
- Nếu độ mờ nhỏ hơn 100, một mặt nạ alpha được áp dụng cho ảnh phủ trước khi hòa trộn.
- Ảnh phủ có thể vượt ra ngoài ranh giới ảnh nền (phần vượt sẽ bị cắt).
- Định hướng EXIF được áp dụng tự động cho cả hai ảnh trước khi xử lý.
- Kích thước đầu ra khớp với kích thước ảnh nền.
