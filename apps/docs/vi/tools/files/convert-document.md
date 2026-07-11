---
description: "Chuyển đổi giữa các định dạng Word, OpenDocument, RTF và văn bản thuần túy."
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 17ac03cea231
---

# Convert Document {#convert-document}

Chuyển đổi tài liệu giữa các định dạng Word (DOCX), OpenDocument (ODT), RTF và văn bản thuần túy bằng LibreOffice.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

Nhận dữ liệu multipart form với một tệp Word/ODT/RTF/TXT và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Định dạng đầu ra: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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
- Định dạng phức tạp (macro, đối tượng nhúng) có thể không được giữ nguyên khi chuyển đổi giữa các định dạng.
- Định dạng đầu ra phải khác với định dạng đầu vào.
