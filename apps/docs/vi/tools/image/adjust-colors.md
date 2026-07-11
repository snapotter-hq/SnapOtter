---
description: "Điều chỉnh độ sáng, độ tương phản, độ bão hòa, nhiệt độ, sắc độ, kênh màu và áp dụng hiệu ứng màu."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 38aff163a3e0
---

# Adjust Colors {#adjust-colors}

Công cụ điều chỉnh màu toàn diện kết hợp độ sáng, độ tương phản, độ phơi sáng, độ bão hòa, nhiệt độ, tông màu, xoay sắc độ, mức độ theo từng kênh và các hiệu ứng một chạm (grayscale, sepia, invert) trong một endpoint duy nhất.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp hình ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Điều chỉnh độ sáng (-100 đến 100) |
| contrast | number | No | `0` | Điều chỉnh độ tương phản (-100 đến 100) |
| exposure | number | No | `0` | Độ phơi sáng / gamma vùng trung (-100 đến 100) |
| saturation | number | No | `0` | Độ bão hòa màu (-100 đến 100) |
| temperature | number | No | `0` | Cân bằng trắng: lạnh/xanh dương đến ấm/cam (-100 đến 100) |
| tint | number | No | `0` | Dịch tông màu: xanh lá đến hồng tím (-100 đến 100) |
| hue | number | No | `0` | Xoay sắc độ theo độ (-180 đến 180) |
| sharpness | number | No | `0` | Cường độ làm sắc nét (0 đến 100) |
| red | number | No | `100` | Mức kênh đỏ (0 đến 200, 100 = không đổi) |
| green | number | No | `100` | Mức kênh xanh lá (0 đến 200, 100 = không đổi) |
| blue | number | No | `100` | Mức kênh xanh dương (0 đến 200, 100 = không đổi) |
| effect | string | No | `"none"` | Hiệu ứng màu: `none`, `grayscale`, `sepia`, `invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Áp dụng vẻ ngoài vintage ấm áp:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- Tất cả tham số mặc định về giá trị trung tính để bạn chỉ điều chỉnh những gì cần thiết.
- Các điều chỉnh được áp dụng theo thứ tự này: độ sáng, độ tương phản, độ phơi sáng, độ bão hòa/sắc độ, nhiệt độ/tông màu, độ sắc nét, kênh màu, hiệu ứng.
- Nhiệt độ dùng một ma trận tái kết hợp màu 3x3 trên các trục xanh dương-cam và xanh lá-hồng tím.
- Độ phơi sáng ánh xạ tới hàm gamma của Sharp (giá trị dương làm sáng vùng trung, giá trị âm làm tối chúng).
- Endpoint này cũng phản hồi tại các đường dẫn cũ `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` và `/api/v1/tools/image/color-effects`. Tất cả đều dùng cùng một schema.
- Định dạng đầu ra khớp với định dạng đầu vào. Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
