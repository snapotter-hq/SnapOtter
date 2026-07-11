---
description: "Nung biểu mẫu và chú thích vào nội dung trang."
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 5782e02f2611
---

# Flatten PDF {#flatten-pdf}

Nung các trường biểu mẫu tương tác và chú thích vào nội dung trang, tạo ra một PDF tĩnh trông giống nhau ở mọi nơi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một PDF và tất cả biểu mẫu và chú thích sẽ được làm phẳng.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Giá trị của các trường biểu mẫu được giữ lại dưới dạng văn bản tĩnh trong đầu ra.
- Các chú thích (bình luận, tô sáng, ghi chú dán) trở thành một phần của nội dung trang và không thể chỉnh sửa được nữa.
