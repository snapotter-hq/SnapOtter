---
description: "Áp dụng hiệu ứng duotone hai màu với màu vùng tối và vùng sáng tùy chỉnh."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 2f48047c757c
---

# Duotone {#duotone}

Áp dụng hiệu ứng duotone hai màu cho một ảnh. Ảnh được chuyển sang thang xám, rồi ánh xạ thành một dải chuyển sắc giữa màu vùng tối (tông tối) và màu vùng sáng (tông sáng).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| shadow | string | Không | `"#1e3a8a"` | Màu vùng tối dạng hex (áp dụng cho tông tối) |
| highlight | string | Không | `"#fbbf24"` | Màu vùng sáng dạng hex (áp dụng cho tông sáng) |
| intensity | integer | Không | `100` | Cường độ hiệu ứng (0-100); 0 trả về ảnh gốc, 100 áp dụng duotone đầy đủ |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Ghi chú {#notes}

- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD và SVG được giải mã tự động trước khi xử lý.
- Giá trị `intensity` nhỏ hơn 100 pha trộn kết quả duotone với ảnh gốc, cho phép tạo hiệu ứng nhẹ nhàng hơn.
- Các kết hợp duotone phổ biến gồm xanh navy/vàng gold, teal/coral, và tím/hồng.
