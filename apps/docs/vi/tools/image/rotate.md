---
description: "Xoay ảnh theo bất kỳ góc nào và lật ngang hoặc dọc."
i18n_source_hash: af2581d7cd8d
i18n_provenance: human
i18n_output_hash: 6da34b96b804
---

# Rotate & Flip {#rotate-flip}

Xoay ảnh theo một góc bất kỳ và/hoặc lật chúng theo chiều ngang hoặc dọc. Các thao tác xoay và lật có thể kết hợp trong một yêu cầu duy nhất.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

Chấp nhận multipart form data với một tệp ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | Góc xoay tính bằng độ (theo chiều kim đồng hồ). Chấp nhận bất kỳ giá trị số nào. |
| horizontal | boolean | No | `false` | Lật ảnh theo chiều ngang (đối xứng gương) |
| vertical | boolean | No | `false` | Lật ảnh theo chiều dọc |

## Example Request {#example-request}

Xoay 90 độ theo chiều kim đồng hồ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

Lật theo chiều ngang:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

Xoay và lật cùng lúc:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- Xoay được áp dụng trước, rồi đến các thao tác lật.
- Các góc xoay không phải 90 độ (ví dụ 45 độ) sẽ mở rộng khung để vừa với ảnh đã xoay, với phần tô trong suốt hoặc đen tùy theo định dạng đầu ra.
- Các giá trị thường dùng: 90, 180, 270 cho các phép xoay một phần tư.
- Hướng EXIF được tự động áp dụng trước khi xử lý, nên phép xoay là tương đối với hướng hiển thị.
