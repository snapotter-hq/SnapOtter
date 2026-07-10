---
description: "Thêm hiệu ứng vignette với cường độ, màu sắc, và vị trí có thể điều chỉnh."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 59ccd9d0bf33
---

# Vignette {#vignette}

Thêm hiệu ứng vignette làm tối hoặc nhuộm màu các cạnh của ảnh. Hỗ trợ cường độ, màu sắc, bán kính, độ mềm, độ tròn, và vị trí tâm có thể điều chỉnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| strength | number | Không | `0.5` | Độ mờ đục vignette (0.1-1) |
| color | string | Không | `"#000000"` | Màu vignette dạng hex |
| radius | integer | Không | `70` | Bán kính ngoài tính theo phần trăm nửa đường chéo (0-100) |
| softness | integer | Không | `50` | Độ mềm của phần feather (0-100); giá trị cao hơn tạo ra sự mờ dần từ tốn hơn |
| roundness | integer | Không | `100` | Hình dạng: 100 = hình tròn, 0 = hình elip khớp với tỷ lệ khung hình ảnh |
| centerX | integer | Không | `50` | Vị trí tâm ngang tính theo phần trăm (0-100) |
| centerY | integer | Không | `50` | Vị trí tâm dọc tính theo phần trăm (0-100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Ghi chú {#notes}

- `radius` nhỏ hơn làm tối nhiều hơn phần ảnh; bán kính lớn hơn giới hạn vignette ở các cạnh ngoài cùng.
- Dùng `color` không phải màu đen (ví dụ tông trắng hoặc sepia) cho các hiệu ứng vignette sáng tạo.
- Điều chỉnh `centerX` và `centerY` cho phép bạn đặt vùng rõ nét lệch tâm, hữu ích để tập trung sự chú ý vào một chủ thể không ở giữa khung hình.
- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD, và SVG được tự động giải mã trước khi xử lý.
