---
description: "Tuyến tính hóa một PDF để xem nhanh trên web (tải xuống lũy tiến)."
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 28a291a724a9
---

# Web-Optimize PDF {#web-optimize-pdf}

Tuyến tính hóa một PDF để nó có thể được tải xuống và hiển thị lũy tiến trong các trình duyệt web mà không phải chờ toàn bộ tệp.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF. Không cần trường `settings`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt. Tải trực tiếp tệp PDF lên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- Việc tuyến tính hóa sắp xếp lại cấu trúc bên trong của PDF để trang đầu tiên có thể hiển thị trước khi toàn bộ tệp được tải xuống.
- Tệp đầu ra có thể lớn hơn một chút so với đầu vào do dữ liệu tuyến tính hóa được thêm vào.
- Các PDF đã được tuyến tính hóa vẫn được tuyến tính hóa lại mà không gặp vấn đề gì.
