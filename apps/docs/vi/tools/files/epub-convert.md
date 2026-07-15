---
description: "Chuyển đổi một EPUB sang PDF, DOCX, HTML hoặc Markdown."
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 799e72fe641c
---

# Chuyển đổi từ EPUB {#convert-epub}

Chuyển đổi một sách điện tử EPUB sang PDF, Word (DOCX), HTML hoặc Markdown. Các tài nguyên từ xa bên trong sách không được tải về.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

Nhận dữ liệu multipart form với một tệp EPUB và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Định dạng đầu ra: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- Định dạng đầu vào được chấp nhận: `.epub`.
- Các tài nguyên từ xa nhúng trong EPUB (ảnh, phông chữ bên ngoài) không được tải về vì lý do bảo mật.
- Độ trung thực của hình ảnh trong đầu ra đã chuyển đổi có thể khác nhau tùy theo cấu trúc EPUB.
- Việc chuyển đổi được xử lý bởi Pandoc trên máy chủ.
