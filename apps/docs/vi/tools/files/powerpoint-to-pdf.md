---
description: "Chuyển đổi bản trình bày sang PDF."
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: cff9dbc97508
---

# PowerPoint to PDF {#powerpoint-to-pdf}

Chuyển đổi bản trình bày PowerPoint hoặc OpenDocument sang PDF, mỗi trang một slide.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PowerPoint/ODP.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một bản trình bày và nó sẽ được chuyển đổi thành PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
```

## Example Response {#example-response}

Trả về `202 Accepted`. Theo dõi tiến trình qua SSE tại `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Các định dạng đầu vào được chấp nhận: `.pptx`, `.ppt`, `.odp`.
- Mỗi slide trở thành một trang trong PDF.
- Việc chuyển đổi được xử lý bởi LibreOffice chạy ở chế độ headless trên máy chủ.
- Hoạt ảnh và hiệu ứng chuyển tiếp không được đưa vào đầu ra PDF.
