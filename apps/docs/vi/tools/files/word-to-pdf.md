---
description: "Chuyển đổi tài liệu Word sang PDF."
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: c2bd1817fd51
---

# Word to PDF {#word-to-pdf}

Chuyển đổi tài liệu Word, văn bản OpenDocument, RTF hoặc tệp văn bản thuần sang PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp Word/ODT/RTF/TXT.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một tài liệu và nó sẽ được chuyển đổi thành PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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

- Các định dạng đầu vào được chấp nhận: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`.
- Việc chuyển đổi được xử lý bởi LibreOffice chạy ở chế độ headless trên máy chủ.
- Phông chữ được nhúng trong tài liệu sẽ được dùng khi có sẵn; nếu không, phông chữ hệ thống sẽ được thay thế.
- Đầu trang, chân trang, bảng và hình ảnh được giữ nguyên trong đầu ra PDF.
