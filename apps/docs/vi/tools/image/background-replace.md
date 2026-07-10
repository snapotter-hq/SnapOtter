---
description: "Thay thế nền hình ảnh bằng một màu đơn sắc hoặc dải màu bằng AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 69c3fdd4f116
---

# Background Replace {#background-replace}

Thay thế nền của một hình ảnh bằng một màu đơn sắc hoặc dải màu. Mô hình AI phát hiện chủ thể, loại bỏ nền gốc và ghép chủ thể lên nền bạn đã chọn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp hình ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | Chế độ nền: `color` hoặc `gradient` |
| color | string | No | `"#ffffff"` | Màu hex của nền (khi backgroundType là `color`) |
| gradientColor1 | string | No | - | Màu hex đầu tiên của dải màu |
| gradientColor2 | string | No | - | Màu hex thứ hai của dải màu |
| gradientAngle | integer | No | `180` | Góc dải màu theo độ (0-360) |
| feather | integer | No | `0` | Bán kính làm mờ viền (0-20) |
| format | string | No | `"png"` | Định dạng đầu ra: `png` hoặc `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Theo dõi tiến trình qua SSE tại `GET /api/v1/jobs/{jobId}/progress`. Khi công việc hoàn tất, luồng SSE phát ra một sự kiện `completed` với URL tải xuống.

## Notes {#notes}

- Đây là một công cụ dựa trên AI trả về `202 Accepted` và xử lý bất đồng bộ. Kết nối tới endpoint SSE để nhận cập nhật tiến trình và kết quả cuối cùng.
- Yêu cầu cài đặt gói tính năng **background-removal**. Trả về `501` nếu gói không có sẵn.
- Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
- Đầu ra mặc định là PNG để giữ độ trong suốt quanh chủ thể.
