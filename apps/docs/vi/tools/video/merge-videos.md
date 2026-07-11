---
description: "Nối nhiều clip video thành một file."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 7a48a5e1d2f7
---

# Merge Videos {#merge-videos}

Nối nhiều clip video thành một file MP4 duy nhất. Tất cả đầu vào được chuẩn hóa về độ phân giải của video đầu tiên và 30 fps.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Nhận multipart form data gồm hai hoặc nhiều file video. Đây là endpoint bất đồng bộ - nó trả về `202 Accepted` ngay lập tức và tiến độ được truyền qua SSE tại `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt nào. Tải lên 2-10 file video dưới dạng nhiều phần `file`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Các clip được ghép nối theo thứ tự tải lên.
- Tất cả các clip được mã hóa lại để khớp với độ phân giải, tốc độ khung hình (30 fps) và codec (H.264) của clip đầu tiên. Các đầu vào không khớp được tự động chuẩn hóa.
- Chấp nhận 2-10 file video mỗi yêu cầu.
- Cập nhật tiến độ có sẵn qua SSE tại `GET /api/v1/jobs/{jobId}/progress` cho đến khi tác vụ hoàn tất.
