---
description: "Chuyển đổi bảng tính sang PDF."
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 6cd352f110b8
---

# Excel to PDF {#excel-to-pdf}

Chuyển đổi bảng tính Excel, OpenDocument hoặc CSV sang PDF. Các trang tính rộng có thể được phân trang qua nhiều trang.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

Nhận dữ liệu multipart form với một tệp Excel/ODS/CSV.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên một bảng tính và nó sẽ được chuyển đổi sang PDF.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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
- Các trang tính rộng có thể bị chia qua nhiều trang trong PDF kết quả.
- Biểu đồ và định dạng có điều kiện được kết xuất trong đầu ra PDF.
- Việc chuyển đổi được xử lý bởi LibreOffice chạy ở chế độ headless trên máy chủ.
