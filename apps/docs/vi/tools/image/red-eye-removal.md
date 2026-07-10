---
description: "Phát hiện và sửa mắt đỏ do đèn flash máy ảnh gây ra, do AI hỗ trợ."
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: d839f0139ddd
---

# Red Eye Removal {#red-eye-removal}

Phát hiện và sửa mắt đỏ do đèn flash máy ảnh gây ra, do AI hỗ trợ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| sensitivity | number | No | `50` | Độ nhạy phát hiện mắt đỏ (0-100). Giá trị càng cao càng phát hiện mắt đỏ tinh tế hơn |
| strength | number | No | `70` | Cường độ sửa (0-100). Mức độ mạnh khi trung hòa màu đỏ |
| format | string | No | - | Định dạng đầu ra (ghi đè tùy chọn) |
| quality | number | No | `90` | Chất lượng đầu ra (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes {#notes}

- Yêu cầu cài đặt model bundle `face-detection` (200-300 MB).
- Trước tiên phát hiện khuôn mặt, sau đó xác định các vùng mắt trong mỗi khuôn mặt, và cuối cùng nhận dạng và sửa các pixel mắt đỏ.
- Số lượng `facesDetected` cho biết đã tìm thấy bao nhiêu khuôn mặt; `eyesCorrected` là tổng số mắt riêng lẻ đã được sửa mắt đỏ.
- Đầu ra luôn là PNG để bảo toàn chất lượng tối đa.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
