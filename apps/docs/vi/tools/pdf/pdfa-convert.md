---
description: "Chuyển đổi một PDF sang định dạng lưu trữ PDF/A-2 để bảo tồn dài hạn."
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 13590adfaafe
---

# PDF/A Convert {#pdf-a-convert}

Chuyển đổi một PDF sang định dạng lưu trữ PDF/A-2, phù hợp cho việc bảo tồn dài hạn và tuân thủ quy định.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF. Không cần trường `settings`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt. Tải trực tiếp tệp PDF lên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- Đầu ra tuân theo tiêu chuẩn PDF/A-2.
- PDF/A nhúng tất cả phông chữ và không cho phép tham chiếu bên ngoài, vì vậy tệp đầu ra có thể lớn hơn bản gốc.
- Mã hóa và JavaScript bị loại bỏ trong quá trình chuyển đổi, vì chúng không được tiêu chuẩn PDF/A cho phép.
