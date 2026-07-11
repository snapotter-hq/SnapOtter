---
description: "Chuyển đổi một tệp HTML sang PDF."
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 2eaa73043749
---

# HTML to PDF {#html-to-pdf}

Chuyển đổi một tệp HTML thành một tài liệu PDF có định kiểu. Các tài nguyên từ xa (ảnh, biểu định kiểu, script bên ngoài) bị vô hiệu hóa vì quyền riêng tư.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

Nhận dữ liệu multipart form với một tệp HTML.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên một tệp HTML và nó sẽ được chuyển đổi sang PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- Các định dạng đầu vào được chấp nhận: `.html`, `.htm`.
- Các tài nguyên từ xa (ảnh, biểu định kiểu, script được tham chiếu qua URL) không được tải về vì quyền riêng tư và bảo mật.
- Các kiểu nội tuyến và ảnh nhúng (data URI) được giữ nguyên.
- Việc chuyển đổi được xử lý bởi WeasyPrint trên máy chủ.
