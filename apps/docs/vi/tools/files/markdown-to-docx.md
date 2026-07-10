---
description: "Chuyển đổi một tệp Markdown thành tài liệu Word (DOCX)."
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: d171cfa696fc
---

# Markdown to Word {#markdown-to-word}

Chuyển đổi một tệp Markdown thành tài liệu Word (DOCX), giữ nguyên tiêu đề, danh sách, khối mã và các định dạng khác.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

Nhận dữ liệu multipart form với một tệp Markdown.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên một tệp Markdown và nó sẽ được chuyển đổi sang DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- Các định dạng đầu vào được chấp nhận: `.md`, `.markdown`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Tiêu đề, chữ đậm, chữ nghiêng, liên kết, khối mã và danh sách được ánh xạ sang các kiểu Word.
- Việc chuyển đổi được xử lý bởi Pandoc trên máy chủ.
