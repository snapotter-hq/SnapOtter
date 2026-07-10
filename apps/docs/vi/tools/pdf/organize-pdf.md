---
description: "Sắp xếp lại các trang trong một PDF với thứ tự trang rõ ràng."
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: b83a28cfb747
---

# Organize PDF {#organize-pdf}

Sắp xếp lại các trang trong một PDF bằng cách chỉ định trình tự trang mong muốn.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| order | string | Có | - | Thứ tự trang mong muốn theo cú pháp qpdf, ví dụ `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Phạm vi trang dùng cú pháp qpdf: `3,1,2` sắp xếp lại ba trang đầu tiên, và `5-z` nối thêm các trang 5 đến trang cuối cùng.
- Các trang có thể được nhân đôi bằng cách liệt kê chúng nhiều hơn một lần (ví dụ `"1,1,2,3"` nhân đôi trang 1).
- Các trang không được liệt kê trong chuỗi thứ tự sẽ bị bỏ khỏi đầu ra.
