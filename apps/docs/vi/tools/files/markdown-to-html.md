---
description: "Chuyển đổi một tệp Markdown thành một trang HTML độc lập."
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 85942e6caf12
---

# Markdown to HTML {#markdown-to-html}

Chuyển đổi một tệp Markdown thành một trang HTML độc lập. Các ảnh từ xa được tham chiếu trong nguồn được giữ nguyên trong đầu ra.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

Nhận dữ liệu multipart form với một tệp Markdown.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên một tệp Markdown và nó sẽ được chuyển đổi sang HTML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- Các định dạng đầu vào được chấp nhận: `.md`, `.markdown`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Đầu ra là một trang HTML tự chứa với các kiểu nội tuyến.
- Các URL ảnh từ xa trong nguồn Markdown được giữ nguyên và không được tải về.
