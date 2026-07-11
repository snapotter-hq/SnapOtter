---
description: "Đọc và ghi metadata tài liệu PDF."
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: c6d162cbd092
---

# PDF Metadata {#pdf-metadata}

Đọc và cập nhật các trường metadata tài liệu PDF như tiêu đề, tác giả, chủ đề và từ khóa. Khi không cung cấp cài đặt nào, metadata hiện có được trả về mà không sửa đổi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| title | string | Không | - | Tiêu đề tài liệu (tối đa 500 ký tự) |
| author | string | Không | - | Tác giả tài liệu (tối đa 500 ký tự) |
| subject | string | Không | - | Chủ đề tài liệu (tối đa 500 ký tự) |
| keywords | string | Không | - | Từ khóa tài liệu (tối đa 500 ký tự) |

Tất cả các tham số đều tùy chọn. Các trường bị bỏ qua được giữ nguyên không thay đổi.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Trường `metadata` trong phản hồi chứa metadata kết quả sau mọi cập nhật.
- Để đọc metadata mà không sửa đổi nó, hãy bỏ qua trường `settings` hoặc gửi một đối tượng rỗng.
- Mỗi trường metadata giới hạn ở 500 ký tự.
