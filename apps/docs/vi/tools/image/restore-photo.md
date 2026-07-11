---
description: "Sửa vết xước, vết rách và hư hỏng trên ảnh cũ bằng pipeline AI để phục chế, tăng cường khuôn mặt và tô màu."
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 6890ce82892b
---

# Photo Restoration {#photo-restoration}

Sửa vết xước, vết rách và hư hỏng trên ảnh cũ bằng pipeline AI nhiều bước. Kết hợp sửa vết xước, tăng cường khuôn mặt, khử nhiễu và tô màu tùy chọn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processing:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Model bundle:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| scratchRemoval | boolean | No | `true` | Loại bỏ vết xước và hư hỏng bề mặt |
| faceEnhancement | boolean | No | `true` | Tăng cường khuôn mặt trong ảnh đã phục chế |
| fidelity | number | No | `0.7` | Độ trung thực của tăng cường khuôn mặt (0-1). Giá trị càng cao càng giữ nhiều đặc điểm gốc |
| denoise | boolean | No | `true` | Áp dụng khử nhiễu cho kết quả đã phục chế |
| denoiseStrength | number | No | `25` | Cường độ khử nhiễu (0-100) |
| colorize | boolean | No | `false` | Tô màu ảnh đã phục chế (cho ảnh thang xám) |
| colorizeStrength | number | No | `85` | Cường độ tô màu (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- Yêu cầu cài đặt model bundle `photo-restoration` (4-5 GB).
- Pipeline chạy nhiều bước AI tuần tự: sửa vết xước, tăng cường khuôn mặt (GFPGAN), khử nhiễu và tùy chọn tô màu.
- Mảng `steps` trong kết quả cho biết những bước xử lý nào đã thực sự được thực thi.
- `scratchCoverage` là phần trăm ước tính của diện tích ảnh bị hư hỏng do vết xước.
- `fidelity` kiểm soát mức độ mạnh khi tăng cường khuôn mặt so với việc giữ nguyên diện mạo gốc. Giá trị thấp hơn tạo tăng cường mạnh hơn; giá trị cao hơn thận trọng hơn.
- Tùy chọn `colorize` tự động phát hiện xem ảnh có phải thang xám hay không. Cờ `isGrayscale` trong kết quả xác nhận việc phát hiện này.
- Định dạng đầu ra tự động khớp với định dạng đầu vào.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR, HDR và AVIF thông qua giải mã tự động.
