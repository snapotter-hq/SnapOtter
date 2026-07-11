---
description: "Trình tạo ảnh hộ chiếu và ảnh thẻ do AI hỗ trợ với phát hiện khuôn mặt, xóa nền và ghép tấm để in."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 413767761f2b
---

# Passport Photo {#passport-photo}

Trình tạo ảnh hộ chiếu và ảnh thẻ do AI hỗ trợ. Quy trình hai giai đoạn: phân tích (phát hiện khuôn mặt + xóa nền) rồi tạo (cắt, thay đổi kích thước và ghép tấm để in).

## API Endpoints {#api-endpoints}

Công cụ này sử dụng luồng hai giai đoạn với các endpoint riêng biệt cho phân tích và tạo.

**Model bundles:** `background-removal` và `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Phát hiện các điểm mốc khuôn mặt và xóa nền. Trả về dữ liệu điểm mốc và một bản xem trước để frontend hiển thị bản xem trước cắt.

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Tệp ảnh (multipart) |
| clientJobId | string | No | - | ID job tùy chọn để theo dõi tiến trình qua SSE |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

Nếu `clientJobId` được cung cấp, tiến trình sẽ được truyền phát (0-30% cho phát hiện khuôn mặt, 30-95% cho xóa nền).

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Cắt, thay đổi kích thước và tùy chọn ghép ảnh lên một tấm in. Sử dụng ảnh đã lưu trong bộ nhớ đệm từ Phase 1 (không chạy lại AI).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID job từ Phase 1 |
| filename | string | Yes | - | Tên tệp gốc từ Phase 1 |
| countryCode | string | Yes | - | Mã quốc gia cho thông số hộ chiếu (ví dụ: `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | Loại giấy tờ (theo thông số quốc gia) |
| bgColor | string | No | `"#FFFFFF"` | Màu nền dạng hex |
| printLayout | string | No | `"none"` | Bố cục giấy in: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | Ràng buộc kích thước tệp tối đa tính bằng KB (0 = không giới hạn) |
| dpi | number | No | `300` | DPI đầu ra (72-1200) |
| customWidthMm | number | No | - | Chiều rộng ảnh tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| customHeightMm | number | No | - | Chiều cao ảnh tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| zoom | number | No | `1` | Hệ số thu phóng (0.5-3). Giá trị > 1 cắt sát hơn |
| adjustX | number | No | `0` | Điều chỉnh vị trí theo chiều ngang |
| adjustY | number | No | `0` | Điều chỉnh vị trí theo chiều dọc |
| landmarks | object | Yes | - | Đối tượng điểm mốc từ phản hồi Phase 1 |
| imageWidth | number | Yes | - | Chiều rộng ảnh từ phản hồi Phase 1 |
| imageHeight | number | Yes | - | Chiều cao ảnh từ phản hồi Phase 1 |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

Trả về hướng dẫn dùng đúng endpoint con.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- Yêu cầu cài đặt các model bundle `background-removal` và `face-detection`.
- Phase 1 chạy AI (điểm mốc khuôn mặt + xóa nền) và lưu kết quả vào bộ nhớ đệm. Phase 2 là thao tác ảnh Sharp thuần túy (nhanh, không cần AI).
- Các điểm mốc được trả về dưới dạng tọa độ chuẩn hóa (khoảng 0-1 tương đối với kích thước ảnh).
- Trường `preview` trong phản hồi phân tích là một PNG mã hóa base64 (tối đa rộng 800px) để hiển thị nhanh.
- Thông số quốc gia bao gồm kích thước giấy tờ, tỷ lệ chiều cao đầu và vị trí đường mắt dựa trên yêu cầu ảnh hộ chiếu chính thức.
- Tùy chọn `printLayout` tạo một tấm ghép trên giấy 4x6\" hoặc A4 với khoảng cách 2mm giữa các ảnh.
- Khi `maxFileSizeKb` được đặt, đầu ra sẽ được nén lặp lại để vừa với giới hạn kích thước.
