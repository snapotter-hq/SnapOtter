---
description: "Trích xuất các phần tử lặp lại từ XML vào một bảng CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 09b464252037
---

# XML to CSV {#xml-to-csv}

Trích xuất các phần tử lặp lại từ một tệp XML vào một bảng CSV phẳng. Công cụ tự động tìm mảng đối tượng đầu tiên trong cây XML và ánh xạ mỗi phần tử thành một hàng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp XML. Không cần trường settings.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Phần tử lặp lại được tự động phát hiện từ cấu trúc XML.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- Chỉ chấp nhận tệp `.xml` làm đầu vào.
- Công cụ quét cây XML để tìm tập phần tử anh em lặp lại đầu tiên và dùng chúng làm các hàng.
- Mỗi tên phần tử con hoặc thuộc tính duy nhất trở thành một tiêu đề cột CSV.
- Đây là một chuyển đổi một chiều. Để chuyển đổi JSON/XML hai chiều, hãy dùng công cụ [JSON to XML](/vi/tools/files/json-xml).
