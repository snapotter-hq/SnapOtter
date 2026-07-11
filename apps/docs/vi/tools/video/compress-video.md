---
description: "Giảm kích thước file video với khả năng kiểm soát chất lượng."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 48b15d782a05
---

# Compress Video {#compress-video}

Giảm kích thước file video bằng cách sử dụng cường độ nén có thể cấu hình và tùy chọn giảm độ phân giải.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Cường độ nén: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Độ phân giải đầu ra: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Preset `light` giữ chất lượng gần như gốc. Preset `strong` giảm kích thước file mạnh mẽ với cái giá là độ trung thực hình ảnh.
- Giảm độ phân giải (ví dụ từ 4K xuống 720p) kết hợp với nén để giảm kích thước đáng kể.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
