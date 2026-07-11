---
description: "Khử nhiễu và hạt do AI hỗ trợ với các tùy chọn chất lượng nhiều cấp."
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: e84afc5fb1a9
---

# Noise Removal {#noise-removal}

Khử nhiễu và hạt do AI hỗ trợ với các tùy chọn chất lượng nhiều cấp, sử dụng Python sidecar (mô hình SCUNet).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processing:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| tier | string | No | `"balanced"` | Cấp chất lượng: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | Cường độ khử nhiễu (0-100) |
| detailPreservation | number | No | `50` | Mức độ giữ lại chi tiết (0-100). Giá trị càng cao càng giữ nhiều kết cấu |
| colorNoise | number | No | `30` | Cường độ khử nhiễu màu (0-100) |
| format | string | No | `"original"` | Định dạng đầu ra: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | Chất lượng mã hóa đầu ra (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- Yêu cầu cài đặt model bundle `upscale-enhance` (5-6 GB).
- Các cấp chất lượng đánh đổi tốc độ lấy chất lượng: `quick` nhanh nhất với khử nhiễu cơ bản, `maximum` dùng phương pháp nhiều lượt kỹ lưỡng nhất.
- Tham số `detailPreservation` rất quan trọng với các đối tượng có kết cấu (vải, tóc, tán lá). Giá trị càng cao càng ngăn bộ khử nhiễu làm mịn mất các chi tiết nhỏ.
- Khi `format` được đặt thành `"original"`, định dạng đầu ra khớp với định dạng tệp đầu vào.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
