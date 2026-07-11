---
description: "Trích xuất khung hình từ video dưới dạng file ZIP chứa ảnh."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: 816aa65c95ac
---

# Video to Frames {#video-to-frames}

Trích xuất các khung hình riêng lẻ từ video và tải xuống dưới dạng file ZIP chứa ảnh PNG hoặc JPG.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Chế độ trích xuất: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Trích xuất mỗi khung hình thứ N (2-1000). Chỉ dùng khi mode là `"nth"` |
| timestamps | string | No | `""` | Các dấu thời gian phân tách bằng dấu phẩy tính bằng giây. Bắt buộc khi mode là `"timestamps"` |
| format | string | No | `"png"` | Định dạng ảnh cho các khung hình trích xuất: `png`, `jpg` |

## Example Request {#example-request}

Trích xuất mỗi khung hình thứ 30 dưới dạng JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Trích xuất các khung hình tại các dấu thời gian cụ thể:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- Chế độ `all` trích xuất mọi khung hình và có thể tạo ra file ZIP rất lớn với các video dài. Dùng chế độ `nth` hoặc `timestamps` để trích xuất có chọn lọc.
- PNG giữ nguyên chất lượng đầy đủ nhưng tạo ra file lớn hơn. JPG nhỏ hơn nhưng có mất dữ liệu.
- Phản hồi tải xuống dưới dạng file ZIP chứa các file ảnh được đánh số tuần tự.
