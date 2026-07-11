---
description: "Chuyển đổi giữa CSV và JSON, cả hai chiều."
i18n_source_hash: 978c08ad46d3
i18n_provenance: human
i18n_output_hash: 7d696cb2fe64
---

# CSV to JSON {#csv-to-json}

Chuyển đổi giữa các định dạng CSV và JSON theo cả hai chiều. Tải lên tệp CSV hoặc TSV để nhận một mảng JSON các đối tượng, hoặc tải lên một mảng JSON để nhận tệp CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Nhận dữ liệu multipart form với một tệp CSV, TSV hoặc JSON và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | In đẹp đầu ra JSON với thụt lề |

## Example Request {#example-request}

CSV sang JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON sang CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- Chiều chuyển đổi được tự động phát hiện từ phần mở rộng tệp đầu vào: `.csv` hoặc `.tsv` tạo ra `.json`, còn `.json` tạo ra `.csv`.
- Tham số `pretty` chỉ ảnh hưởng đến đầu ra JSON. Khi đặt thành `false`, đầu ra là một chuỗi JSON gọn trên một dòng.
- Đầu vào JSON phải là một mảng các đối tượng có các khóa nhất quán. Mỗi đối tượng trở thành một hàng, và mỗi khóa trở thành một tiêu đề cột.
- Các tệp TSV (giá trị phân tách bằng tab) được hỗ trợ song song với CSV.
