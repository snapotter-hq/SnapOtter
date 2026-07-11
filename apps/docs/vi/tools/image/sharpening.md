---
description: "Làm sắc nét ảnh bằng phương pháp adaptive, unsharp mask hoặc high-pass với tùy chọn giảm nhiễu."
i18n_source_hash: ccb60af9faae
i18n_provenance: human
i18n_output_hash: c519581a7822
---

# Làm sắc nét {#sharpening}

Công cụ làm sắc nét nâng cao với ba phương pháp: adaptive (nhận biết cạnh thông minh), unsharp mask (radius/amount cổ điển), và high-pass (nhấn mạnh kết cấu). Bao gồm tính năng giảm nhiễu tích hợp để ngăn các hiện tượng lỗi khi làm sắc nét.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| method | string | Không | `"adaptive"` | Thuật toán làm sắc nét: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Không | `1.0` | Adaptive: sigma Gaussian (0.5 đến 10) |
| m1 | number | Không | `1.0` | Adaptive: làm sắc nét vùng phẳng (0 đến 10) |
| m2 | number | Không | `3.0` | Adaptive: làm sắc nét vùng răng cưa (0 đến 20) |
| x1 | number | Không | `2.0` | Adaptive: ngưỡng phẳng/răng cưa (0 đến 10) |
| y2 | number | Không | `12` | Adaptive: mức làm sắc nét tối đa vùng phẳng (0 đến 50) |
| y3 | number | Không | `20` | Adaptive: mức làm sắc nét tối đa vùng răng cưa (0 đến 50) |
| amount | number | Không | `100` | Unsharp mask: lượng làm sắc nét (0 đến 1000) |
| radius | number | Không | `1.0` | Unsharp mask: bán kính làm mờ tính bằng pixel (0.1 đến 5) |
| threshold | number | Không | `0` | Unsharp mask: chênh lệch độ sáng tối thiểu để làm sắc nét (0 đến 255) |
| strength | number | Không | `50` | High-pass: cường độ bộ lọc (0 đến 100) |
| kernelSize | number | Không | `3` | High-pass: kích thước kernel tích chập (3 hoặc 5) |
| denoise | string | Không | `"off"` | Giảm nhiễu trước khi làm sắc nét: `off`, `light`, `medium`, `strong` |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unsharp mask với threshold để bảo vệ các vùng mượt:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Ghi chú {#notes}

- Chỉ những tham số liên quan đến phương pháp được chọn mới được sử dụng. Ví dụ, `amount`, `radius`, và `threshold` bị bỏ qua khi `method` là `adaptive`.
- Phương pháp adaptive sử dụng tính năng làm sắc nét adaptive tích hợp của Sharp với hành vi vùng phẳng/răng cưa có thể cấu hình.
- Tùy chọn `denoise` áp dụng giảm nhiễu trước khi làm sắc nét để ngăn khuếch đại nhiễu/hạt.
- Làm sắc nét high-pass trích xuất chi tiết mịn bằng cách trừ đi phiên bản đã làm mờ khỏi ảnh gốc, rồi hòa trộn ngược lại.
- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD, và SVG được tự động giải mã trước khi xử lý.
