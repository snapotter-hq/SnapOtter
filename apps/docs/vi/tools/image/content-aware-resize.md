---
description: "Thay đổi kích thước bằng khắc đường nối, thêm hoặc bớt pixel dọc theo các đường ít quan trọng để giữ nội dung chính và khuôn mặt."
i18n_source_hash: 16ea4c2778e1
i18n_provenance: human
i18n_output_hash: db2295c225c9
---

# Thay đổi kích thước theo nội dung {#content-aware-resize}

Thay đổi kích thước bằng khắc đường nối, loại bỏ hoặc thêm pixel một cách thông minh dọc theo các đường ít quan trọng nhất về mặt thị giác, giữ lại nội dung quan trọng và tùy chọn bảo vệ khuôn mặt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Xử lý:** Bất đồng bộ (trả về 202, thăm dò `/api/v1/jobs/{jobId}/progress` để lấy trạng thái qua SSE)

**Bộ mô hình:** Không cần cho thao tác cơ bản. Bảo vệ khuôn mặt sử dụng bộ `face-detection` (200-300 MB) nếu bật.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| file | file | Có | - | Tệp ảnh (multipart) |
| width | number | Không | - | Chiều rộng mục tiêu tính bằng pixel |
| height | number | Không | - | Chiều cao mục tiêu tính bằng pixel |
| protectFaces | boolean | Không | `false` | Phát hiện và bảo vệ khuôn mặt khỏi bị khắc bỏ đường nối |
| blurRadius | number | Không | `4` | Bán kính làm mờ tiền xử lý để tính năng lượng (0-20) |
| sobelThreshold | number | Không | `2` | Ngưỡng phát hiện cạnh Sobel (1-20). Giá trị cao hơn khiến thuật toán quyết liệt hơn |
| square | boolean | Không | `false` | Thay đổi kích thước thành hình vuông (dùng chiều nhỏ hơn) |

Phải chỉ định ít nhất một trong `width`, `height` hoặc `square`.

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Phản hồi {#response}

### Phản hồi ban đầu (202 Accepted) {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Kết quả cuối cùng (qua SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## Ghi chú {#notes}

- Sử dụng thư viện khắc đường nối `caire` để thay đổi kích thước theo nội dung.
- Chỉ giảm kích thước (loại bỏ đường nối). Không thể mở rộng ảnh vượt quá kích thước ban đầu.
- Tùy chọn `protectFaces` dùng AI phát hiện khuôn mặt để đánh dấu vùng mặt là năng lượng cao, ngăn đường nối đi qua khuôn mặt.
- `blurRadius` kiểm soát mức làm mượt trước khi tính bản đồ năng lượng. Giá trị cao hơn làm bản đồ năng lượng đồng đều hơn, có thể giú ích với ảnh nhiều nhiễu.
- `sobelThreshold` ảnh hưởng đến mức độ quyết liệt khi phát hiện cạnh. Giá trị thấp hơn giữ lại nhiều cạnh tinh tế hơn.
- Đầu ra luôn ở định dạng PNG.
- Hỗ trợ định dạng đầu vào HEIC/HEIF, RAW, TGA, PSD, EXR và HDR thông qua giải mã tự động.
