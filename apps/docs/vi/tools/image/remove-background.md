---
description: "Xóa nền do AI hỗ trợ với các hiệu ứng tùy chọn (làm mờ, đổ bóng, gradient, nền tùy chỉnh)."
i18n_source_hash: 326a91284529
i18n_provenance: human
i18n_output_hash: 52ddf417f567
---

# Remove Background {#remove-background}

Xóa nền do AI hỗ trợ với các hiệu ứng tùy chọn (làm mờ, đổ bóng, gradient, nền tùy chỉnh).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| model | string | No | - | Biến thể mô hình AI cần dùng |
| backgroundType | string | No | `"transparent"` | Một trong: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | - | Màu hex cho nền đặc |
| gradientColor1 | string | No | - | Màu gradient thứ nhất |
| gradientColor2 | string | No | - | Màu gradient thứ hai |
| gradientAngle | number | No | - | Góc gradient tính bằng độ |
| blurEnabled | boolean | No | - | Bật hiệu ứng làm mờ nền |
| blurIntensity | number | No | - | Cường độ làm mờ (0-100) |
| shadowEnabled | boolean | No | - | Bật đổ bóng lên đối tượng |
| shadowOpacity | number | No | - | Độ mờ đục của bóng (0-100) |
| outputFormat | string | No | - | Định dạng đầu ra: `png`, `webp`, hoặc `avif` |
| edgeRefine | integer | No | - | Mức tinh chỉnh cạnh (0-3) |
| decontaminate | boolean | No | - | Loại bỏ màu lem ở các cạnh |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType":"transparent","edgeRefine":2,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalUrl": "/api/v1/download/{jobId}/photo_original.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

Áp dụng lại các hiệu ứng nền mà không chạy lại mô hình AI. Sử dụng mask và ảnh gốc đã lưu trong bộ nhớ đệm từ Phase 1.

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | JSON với cài đặt hiệu ứng (xem bên dưới) |
| backgroundImage | file | No | - | Ảnh nền tùy chỉnh (khi backgroundType là `image`) |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| jobId | string | Yes | ID job từ Phase 1 |
| filename | string | Yes | Tên tệp gốc từ Phase 1 |
| backgroundType | string | No | `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | No | Màu hex cho nền đặc |
| gradientColor1 | string | No | Màu gradient thứ nhất |
| gradientColor2 | string | No | Màu gradient thứ hai |
| gradientAngle | number | No | Góc gradient tính bằng độ |
| blurEnabled | boolean | No | Bật làm mờ nền |
| blurIntensity | number | No | Cường độ làm mờ (0-100) |
| shadowEnabled | boolean | No | Bật đổ bóng |
| shadowOpacity | number | No | Độ mờ đục của bóng (0-100) |
| outputFormat | string | No | `png`, `webp`, hoặc `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

## Notes {#notes}

- Yêu cầu cài đặt model bundle `background-removal` (4-5 GB).
- Phase 1 lưu vào bộ nhớ đệm mask trong suốt và ảnh gốc để Phase 2 (hiệu ứng) có thể áp dụng lại các nền khác nhau tức thì mà không chạy lại mô hình AI.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
- Xoay EXIF được tự động sửa trước khi xử lý.
