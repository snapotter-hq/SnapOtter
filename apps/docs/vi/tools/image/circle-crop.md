---
description: "Cắt một hình ảnh thành một hình tròn được căn giữa với các góc trong suốt."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: c9705aadd685
---

# Circle Crop {#circle-crop}

Cắt một hình ảnh thành một hình tròn được căn giữa với các góc trong suốt. Hỗ trợ thu phóng, độ lệch, viền và kích thước đầu ra có thể điều chỉnh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp hình ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | Hệ số thu phóng (1-5); giá trị cao hơn cắt sát hơn |
| offsetX | number | No | `0.5` | Vị trí tâm theo chiều ngang (0-1) |
| offsetY | number | No | `0.5` | Vị trí tâm theo chiều dọc (0-1) |
| borderWidth | integer | No | `0` | Độ rộng viền tính bằng pixel (0-200) |
| borderColor | string | No | `"#ffffff"` | Màu hex của viền |
| background | string | No | `"transparent"` | Lấp góc: `"transparent"` hoặc một màu hex |
| outputSize | integer | No | - | Kích thước vuông cuối cùng tính bằng pixel (16-4096) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- Đầu ra luôn là PNG để giữ các góc trong suốt (trừ khi `background` được đặt thành một màu đơn sắc).
- Hình tròn được nội tiếp trong chiều ngắn hơn của hình ảnh. Dùng `zoom` để cắt sát hơn và `offsetX`/`offsetY` để dịch chuyển vùng hiển thị.
- Khi `outputSize` được cung cấp, kết quả được đổi kích thước thành kích thước vuông đó sau khi cắt.
- Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
