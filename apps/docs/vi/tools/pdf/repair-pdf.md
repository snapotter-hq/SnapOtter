---
description: "Cố gắng sửa chữa một PDF bị hỏng hoặc lỗi."
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: 78667764c2f7
---

# Repair PDF {#repair-pdf}

Cố gắng sửa chữa một PDF bị hỏng hoặc lỗi bằng cách tái tạo lại cấu trúc bên trong của nó.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF. Không cần trường `settings`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt. Tải trực tiếp tệp PDF bị hỏng lên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- Việc xác thực cấu trúc được bỏ qua ở đầu vào để cho phép các tệp không đúng định dạng đi qua.
- Việc sửa chữa là nỗ lực tốt nhất có thể; các tệp bị hỏng nghiêm trọng có thể không được khôi phục hoàn toàn.
- PDF đã sửa chữa có thể khác biệt một chút về kích thước so với bản gốc do các bảng tham chiếu chéo được tái tạo.
