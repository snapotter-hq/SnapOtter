---
description: "Chuyển đổi một PDF thành tài liệu Word (DOCX)."
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 8e9b667463f8
---

# PDF to Word {#pdf-to-word}

Chuyển đổi một PDF dựa trên văn bản thành tài liệu Word (DOCX). Phù hợp nhất cho các PDF có văn bản chọn được; các trang quét sẽ cần OCR trước.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên một PDF và nó sẽ được chuyển đổi thành DOCX.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

Trả về `202 Accepted`. Theo dõi tiến độ qua SSE tại `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Hoạt động tốt nhất với các PDF dựa trên văn bản. Các trang quét hoặc chỉ có hình ảnh sẽ tạo ra đầu ra rỗng hoặc tối thiểu; hãy dùng [PDF OCR](./ocr-pdf) để thêm một lớp văn bản trước.
- Việc chuyển đổi được xử lý bởi LibreOffice chạy headless trên máy chủ.
- Các bố cục phức tạp (nhiều cột, các phần tử chồng lấn) có thể không chuyển đổi hoàn hảo.
