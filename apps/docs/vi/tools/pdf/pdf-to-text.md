---
description: "Trích xuất văn bản thuần từ một PDF."
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: de4cc6209bde
---

# PDF to Text {#pdf-to-text}

Trích xuất tất cả văn bản thuần có thể đọc được từ một tài liệu PDF vào một tệp văn bản.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một PDF và nội dung văn bản của nó sẽ được trích xuất.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Trường `chars` trong phản hồi cho biết số lượng ký tự được trích xuất.
- Chỉ văn bản được nhúng dạng số mới được trích xuất. Đối với tài liệu quét hoặc PDF dựa trên hình ảnh, hãy dùng công cụ [PDF OCR](./ocr-pdf) thay thế.
