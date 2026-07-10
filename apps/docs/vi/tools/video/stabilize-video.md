---
description: "Giảm rung máy quay với ổn định hai lượt."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: aabe0811d9bd
---

# Stabilize Video {#stabilize-video}

Giảm rung máy quay trong cảnh quay cầm tay bằng cách sử dụng ổn định vidstab hai lượt của FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Kích thước cửa sổ làm mượt tính bằng khung hình (5-60). Giá trị cao hơn tạo chuyển động mượt hơn |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Ổn định là một quá trình hai lượt: lượt đầu tiên phân tích chuyển động của máy quay, và lượt thứ hai áp dụng hiệu chỉnh. Việc này mất khoảng gấp đôi thời gian so với các công cụ một lượt.
- Giá trị làm mượt cao hơn loại bỏ nhiều rung hơn nhưng có thể tạo ra một chút cắt xén phóng to ở các cạnh.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
