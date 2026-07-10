---
description: "Chuyển đổi giữa CSV và Excel (XLSX), cả hai chiều."
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 8fa43b12b66d
---

# CSV to Excel {#csv-to-excel}

Chuyển đổi giữa các định dạng CSV và Excel (XLSX) theo cả hai chiều. Tải lên tệp CSV hoặc TSV để nhận XLSX, hoặc tải lên tệp XLSX để nhận CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

Nhận dữ liệu multipart form với một tệp CSV, TSV hoặc XLSX và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | Số thứ tự trang tính cần xuất khi chuyển từ XLSX (tối thiểu 1) |

## Example Request {#example-request}

CSV sang Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel sang CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- Chiều chuyển đổi được tự động phát hiện từ phần mở rộng tệp đầu vào: `.csv` hoặc `.tsv` tạo ra `.xlsx`, còn `.xlsx` tạo ra `.csv`.
- Tham số `sheet` chỉ áp dụng khi chuyển từ XLSX. Nó chọn trang tính nào để xuất.
- Các tệp TSV (giá trị phân tách bằng tab) được hỗ trợ song song với CSV.
