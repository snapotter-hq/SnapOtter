---
description: "Kết hợp nhiều PDF thành một tài liệu duy nhất."
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: 8f481d3df97d
---

# Merge PDFs {#merge-pdfs}

Kết hợp hai hoặc nhiều tệp PDF thành một tài liệu duy nhất, giữ nguyên thứ tự trang của mỗi tệp đầu vào.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với hai hoặc nhiều tệp PDF. Không cần trường `settings`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt. Chỉ cần tải lên hai hoặc nhiều tệp PDF.

| Ràng buộc | Giá trị |
|------------|-------|
| Số tệp tối thiểu | 2 |
| Số tệp tối đa | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- Các tệp được hợp nhất theo thứ tự chúng được tải lên.
- Cần ít nhất hai tệp PDF; yêu cầu sẽ thất bại với lỗi 400 nếu cung cấp ít hơn.
- Số tệp đầu vào tối đa là 20.
- Các PDF được mã hóa phải được mở khóa trước khi hợp nhất.
