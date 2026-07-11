---
description: "Cắt ảnh nhận biết chủ thể, khuôn mặt và entropy để đóng khung ảnh thông minh bằng Sharp và AI phát hiện khuôn mặt."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 61a1c1077782
---

# Smart Crop {#smart-crop}

Cắt thông minh nhận biết chủ thể, nhận biết khuôn mặt, hoặc dựa trên trim. Sử dụng các chiến lược attention/entropy của Sharp và AI phát hiện khuôn mặt để đóng khung thông minh.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Xử lý:** Bất đồng bộ (trả về 202, poll `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Gói mô hình:** `face-detection` (200-300 MB) - chỉ bắt buộc cho chế độ `face`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| mode | string | Không | `"subject"` | Chế độ cắt: `subject`, `face`, `trim`. (Các giá trị cũ `attention` và `content` ánh xạ sang `subject` và `trim`) |
| strategy | string | Không | `"attention"` | Chiến lược cho chế độ subject: `attention` hoặc `entropy` |
| width | integer | Không | - | Chiều rộng đích tính bằng pixel |
| height | integer | Không | - | Chiều cao đích tính bằng pixel |
| padding | integer | Không | `0` | Phần trăm khoảng đệm quanh chủ thể (0-50) |
| facePreset | string | Không | `"head-shoulders"` | Preset đóng khung khuôn mặt: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Không | `0.5` | Độ nhạy phát hiện khuôn mặt (0-1) |
| threshold | integer | Không | `30` | Ngưỡng chế độ trim để phát hiện nền (0-255) |
| padToSquare | boolean | Không | `false` | Đệm kết quả đã trim thành hình vuông |
| padColor | string | Không | `"#ffffff"` | Màu nền cho phần đệm |
| targetSize | integer | Không | - | Kích thước đích cho đầu ra đã đệm (pixel) |
| quality | integer | Không | - | Chất lượng đầu ra (1-100) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Response {#response}

### Response ban đầu (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Tiến trình (SSE tại `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Các chế độ {#modes}

### Chế độ Subject {#subject-mode}
Sử dụng chiến lược attention hoặc entropy của Sharp để tìm vùng thú vị nhất về mặt thị giác và cắt xung quanh vùng đó.

### Chế độ Face {#face-mode}
Phát hiện khuôn mặt bằng AI, sau đó đóng khung phần cắt quanh các khuôn mặt được phát hiện bằng `facePreset` được chỉ định. Chuyển về chế độ subject (chiến lược attention) nếu không phát hiện khuôn mặt nào.

### Chế độ Trim {#trim-mode}
Loại bỏ viền/nền đồng nhất khỏi ảnh. Tùy chọn đệm kết quả thành hình vuông với màu nền và kích thước đích được chỉ định.

## Ghi chú {#notes}

- Công cụ này dùng factory `createToolRoute` với `executionHint: "long"`, nên nó trả về 202 với tiến trình SSE.
- Chế độ face yêu cầu gói mô hình `face-detection` (200-300 MB).
- Chế độ subject và trim hoạt động mà không cần gói mô hình AI nào.
- `facePreset` quyết định mức độ chặt của phần cắt quanh các khuôn mặt được phát hiện: `closeup` là chặt nhất, `half-body` là rộng nhất.
- Nếu không chỉ định width/height, mặc định là 1080x1080.
