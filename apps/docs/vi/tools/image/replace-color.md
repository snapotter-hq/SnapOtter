---
description: "Thay thế một màu cụ thể trong ảnh bằng màu khác hoặc làm cho nó trong suốt."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 3d30cd8aed5b
---

# Replace & Invert Color {#replace-invert-color}

Thay thế các pixel khớp với một màu nguồn bằng một màu đích, hoặc làm cho chúng trong suốt. Sử dụng khoảng cách Euclidean trong không gian RGB với dung sai có thể cấu hình để hòa trộn mượt mà tại ranh giới màu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Chấp nhận multipart form data với một tệp ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | Màu hex cần tìm (định dạng: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | Màu hex để thay thế (định dạng: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | Làm cho các pixel khớp trở nên trong suốt thay vì thay bằng màu đích |
| tolerance | number | No | `30` | Dung sai khớp màu (0 đến 255). Giá trị càng cao khớp với dải màu tương tự càng rộng |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Làm nền xanh lá trở nên trong suốt:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- Việc khớp màu sử dụng khoảng cách Euclidean trong không gian RGB, được điều chỉnh theo `tolerance * sqrt(3)`.
- Việc hòa trộn khi thay thế tỷ lệ thuận với khoảng cách màu: các pixel gần màu nguồn hơn nhận nhiều màu đích hơn, tạo ra chuyển tiếp mượt mà.
- Khi `makeTransparent` là `true`, đầu ra bị buộc thành PNG (hoặc WebP/AVIF) nếu định dạng đầu vào không hỗ trợ kênh alpha (ví dụ: JPEG).
- Dung sai 0 chỉ khớp chính xác màu nguồn. Giá trị cao hơn (50+) sẽ khớp với dải màu tương tự rộng hơn.
- Định dạng đầu ra khớp với định dạng đầu vào trừ khi cần độ trong suốt và định dạng đầu vào thiếu hỗ trợ alpha.
