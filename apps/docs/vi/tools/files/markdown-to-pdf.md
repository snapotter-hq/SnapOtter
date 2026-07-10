---
description: "Chuyển đổi tệp Markdown thành PDF được định kiểu."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 40fbc855531a
---

# Markdown to PDF {#markdown-to-pdf}

Chuyển đổi tệp Markdown thành tài liệu PDF được định kiểu. Tài nguyên từ xa bị tắt để bảo vệ quyền riêng tư.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp Markdown.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một tệp Markdown và nó sẽ được chuyển đổi thành PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- Các định dạng đầu vào được chấp nhận: `.md`, `.markdown`.
- Tài nguyên từ xa (hình ảnh, bảng định kiểu được tham chiếu qua URL) không được tải về nhằm bảo vệ quyền riêng tư và bảo mật.
- Markdown trước tiên được kết xuất thành HTML, sau đó chuyển đổi thành PDF thông qua WeasyPrint.
- Các khối mã, bảng và những phần tử Markdown khác được định kiểu trong đầu ra PDF.
