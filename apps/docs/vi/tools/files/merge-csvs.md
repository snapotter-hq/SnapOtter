---
description: "Gộp nhiều tệp CSV hoặc TSV có các cột trùng khớp thành một tệp."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 052180b3adef
---

# Merge CSVs {#merge-csvs}

Gộp nhiều tệp CSV hoặc TSV có các cột trùng khớp thành một tệp đã hợp nhất. Tất cả tệp đầu vào phải có cùng tiêu đề cột.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Chấp nhận dữ liệu biểu mẫu multipart với hai tệp CSV trở lên. Không cần trường settings.

## Parameters {#parameters}

Công cụ này không có tham số nào có thể cấu hình. Tải lên 2-20 tệp CSV hoặc TSV có tiêu đề cột trùng khớp.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- Yêu cầu từ 2 đến 20 tệp đầu vào.
- Tất cả tệp phải có chung tiêu đề cột. Việc gộp sẽ thất bại nếu các cột không trùng khớp.
- Hàng tiêu đề được đưa vào một lần trong đầu ra; các hàng dữ liệu từ mọi tệp được nối lại theo thứ tự tải lên.
- Cả tệp CSV và TSV đều được chấp nhận, nhưng tất cả tệp trong một yêu cầu nên dùng cùng một dấu phân cách.
