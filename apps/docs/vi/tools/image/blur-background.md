---
description: "Làm mờ nền trong khi giữ chủ thể sắc nét bằng AI."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: f1087dbcf2be
---

# Blur Background {#blur-background}

Làm mờ nền của một hình ảnh trong khi giữ chủ thể sắc nét. Mô hình AI tách chủ thể, làm mờ nền gốc và ghép chủ thể sắc nét lên trên.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp hình ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| intensity | integer | No | `50` | Cường độ làm mờ (1-100) |
| feather | integer | No | `0` | Bán kính làm mờ viền (0-20) |
| format | string | No | `"png"` | Định dạng đầu ra: `png` hoặc `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Giá trị cường độ cao hơn tạo hiệu ứng làm mờ mạnh hơn. Giá trị trên 80 tạo sự tách biệt kiểu bokeh rõ rệt.
- Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
