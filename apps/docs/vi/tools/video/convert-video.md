---
description: "Chuyển đổi video giữa MP4, MOV, WebM, AVI và MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: da0eafc4efbf
---

# Convert Video {#convert-video}

Chuyển đổi video giữa các định dạng MP4, MOV, WebM, AVI và MKV với các preset chất lượng có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Định dạng đầu ra: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Preset chất lượng: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Preset chất lượng `high` tạo ra độ trung thực hình ảnh tốt nhất nhưng file lớn hơn. Preset `small` nén mạnh để có kích thước file nhỏ nhất.
- Đầu ra WebM dùng mã hóa VP9. MP4 và MOV dùng H.264. AVI và MKV có sẵn cho các quy trình cũ hoặc lưu trữ.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
