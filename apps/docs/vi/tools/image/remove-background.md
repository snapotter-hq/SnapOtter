---
description: "Xóa nền do AI hỗ trợ với các hiệu ứng tùy chọn (làm mờ, đổ bóng, gradient, nền tùy chỉnh)."
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 713fd3ded9b5
---

# Remove Background {#remove-background}

Xóa nền do AI hỗ trợ với các hiệu ứng tùy chọn (làm mờ, đổ bóng, gradient, nền tùy chỉnh).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

Phase 1 xóa nền và lưu vào bộ nhớ đệm mask PNG trong suốt cùng ảnh gốc. Việc thay nền, làm mờ, đổ bóng và chuyển đổi định dạng đầu ra được áp dụng ở [Phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (hoặc khi chạy `remove-background` như một bước trong pipeline hay công việc hàng loạt); truyền các trường đó vào Phase 1 sẽ trả về 400.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| model | string | No | - | Biến thể mô hình AI cần dùng |
| edgeRefine | integer | No | - | Mức tinh chỉnh cạnh (0-3) |
| decontaminate | boolean | No | - | Loại bỏ màu lem ở các cạnh |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
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
| backgroundImage | file | Bắt buộc khi `backgroundType` là `image` | - | Ảnh nền tùy chỉnh |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID job từ Phase 1 |
| filename | string | Yes | - | Tên tệp gốc từ Phase 1 |
| backgroundType | string | No | `"transparent"` | Một trong: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Bắt buộc khi `backgroundType` là `color` | - | Màu hex: `#RRGGBB` hoặc `#RGB` (dấu `#` là tùy chọn) |
| gradientColor1 | string | Bắt buộc khi `backgroundType` là `gradient` | - | Màu gradient thứ nhất, hex như `backgroundColor` |
| gradientColor2 | string | Bắt buộc khi `backgroundType` là `gradient` | - | Màu gradient thứ hai, hex như `backgroundColor` |
| gradientAngle | number | No | - | Góc gradient tính bằng độ |
| blurEnabled | boolean | No | - | Làm mờ nền gốc phía sau chủ thể (`backgroundType: "blur"` ngụ ý bật tùy chọn này) |
| blurIntensity | number | No | - | Cường độ làm mờ (0-100) |
| shadowEnabled | boolean | No | - | Bật đổ bóng lên chủ thể |
| shadowOpacity | number | No | `35` | Độ mờ đục của bóng (0-100), dùng khi `shadowEnabled` là true |
| outputFormat | string | No | `"png"` | Định dạng đầu ra: `png`, `webp` hoặc `avif` |

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

#### Error: Background Removal Expired (410) {#error-background-removal-expired-410}

Endpoint effects hoạt động dựa trên mask và ảnh gốc mà Phase 1 đã lưu cho `jobId`. Các đầu ra đã lưu sẽ bị dọn dẹp sau một thời gian, vì vậy nếu quá nhiều thời gian trôi qua giữa hai lần gọi, chúng sẽ không còn. Hãy chạy lại Phase 1 với cùng ảnh và dùng `jobId` mà nó trả về.

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

Một `jobId` hoặc `filename` không thể chỉ định một tệp đã lưu (dấu phân cách đường dẫn, `..`, chuỗi rỗng) sẽ trả về 400.

## Notes {#notes}

- Yêu cầu cài đặt model bundle `background-removal` (4-5 GB).
- Phase 1 lưu vào bộ nhớ đệm mask trong suốt và ảnh gốc để Phase 2 (hiệu ứng) có thể áp dụng lại các nền khác nhau tức thì mà không chạy lại mô hình AI.
- Hỗ trợ các định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
- Xoay EXIF được tự động sửa trước khi xử lý.
