---
description: "Chuyển đổi giữa các định dạng Excel, OpenDocument và CSV."
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: de2984be5fd5
---

# Convert Spreadsheet {#convert-spreadsheet}

Chuyển đổi bảng tính giữa các định dạng Excel (XLSX), OpenDocument Spreadsheet (ODS) và CSV. Sổ làm việc nhiều trang sẽ xuất trang đầu tiên khi chuyển sang CSV.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

Nhận dữ liệu multipart form với một tệp Excel/ODS/CSV và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | Định dạng đầu ra: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
```

## Example Response {#example-response}

Trả về `202 Accepted`. Theo dõi tiến trình qua SSE tại `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Các định dạng đầu vào được chấp nhận: `.xlsx`, `.xls`, `.ods`, `.csv`.
- Khi chuyển một sổ làm việc nhiều trang sang CSV, chỉ trang đầu tiên được xuất.
- Công thức được tính toán và xuất dưới dạng giá trị tĩnh trong đầu ra CSV.
- Định dạng đầu ra phải khác với định dạng đầu vào.
