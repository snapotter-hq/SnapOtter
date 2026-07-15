---
description: "Tự động phát hiện và làm mờ khuôn mặt trong hình ảnh bằng phát hiện khuôn mặt AI để bảo vệ quyền riêng tư và ẩn danh tuân thủ GDPR."
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: 06621651ff17
---

# Làm mờ khuôn mặt và thông tin nhạy cảm {#face-pii-blur}

Tự động phát hiện và làm mờ khuôn mặt trong hình ảnh bằng phát hiện khuôn mặt dựa trên AI (MediaPipe).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**Xử lý:** Bất đồng bộ (trả về 202, hỏi vòng `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Gói mô hình:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp hình ảnh (multipart) |
| blurRadius | number | No | `30` | Bán kính làm mờ áp dụng cho các khuôn mặt được phát hiện (1-100) |
| sensitivity | number | No | `0.5` | Độ nhạy phát hiện khuôn mặt (0-1). Giá trị thấp hơn phát hiện ít khuôn mặt hơn với độ tin cậy cao hơn |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected {#no-faces-detected}

Nếu không tìm thấy khuôn mặt nào, kết quả bao gồm một cảnh báo:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes {#notes}

- Yêu cầu cài đặt gói mô hình `face-detection` (200-300 MB).
- Định dạng đầu ra tự động khớp với định dạng đầu vào.
- Mảng `faces` chứa tọa độ hộp giới hạn (x, y, width, height) cho mỗi khuôn mặt được phát hiện.
- Tăng `sensitivity` (gần 1.0 hơn) để phát hiện nhiều khuôn mặt hơn, bao gồm cả những khuôn mặt bị che khuất một phần.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
