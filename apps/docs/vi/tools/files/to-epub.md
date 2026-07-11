---
description: "Chuyển đổi tệp Word, Markdown, HTML hoặc văn bản thuần sang EPUB."
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 2b0107b3c169
---

# Convert to EPUB {#convert-to-epub}

Chuyển đổi tài liệu Word, Markdown, HTML hoặc tệp văn bản thuần sang định dạng sách điện tử EPUB.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp Word/Markdown/HTML/TXT.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một tài liệu và nó sẽ được chuyển đổi thành EPUB.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- Các định dạng đầu vào được chấp nhận: `.docx`, `.md`, `.html`, `.txt`.
- Đầu ra EPUB tuân theo đặc tả EPUB 3.
- Các tiêu đề trong tài liệu nguồn được dùng để tạo mục lục.
- Việc chuyển đổi được xử lý bởi Pandoc trên máy chủ.
