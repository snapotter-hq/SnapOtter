---
description: "Tạo biểu đồ cột, đường hoặc tròn từ dữ liệu CSV hoặc JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: d8ec09c12867
---

# Chart Maker {#chart-maker}

Tạo biểu đồ cột, đường hoặc tròn từ dữ liệu CSV hoặc JSON. Trả về một ảnh PNG của biểu đồ đã kết xuất.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Nhận dữ liệu multipart form với một tệp CSV hoặc JSON và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | Loại biểu đồ: `bar`, `line`, `pie` |
| title | string | No | - | Tiêu đề biểu đồ (tối đa 120 ký tự) |
| width | integer | No | `960` | Chiều rộng biểu đồ tính bằng pixel (320-2048) |
| height | integer | No | `540` | Chiều cao biểu đồ tính bằng pixel (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- Đầu vào phải là một tệp `.csv` hoặc `.json`. Tệp CSV nên có một hàng tiêu đề chứa tên cột.
- Cột đầu tiên được dùng làm nhãn danh mục; cột thứ hai phải là số và cung cấp các giá trị dữ liệu. Chỉ hai cột được dùng.
- Đầu vào JSON nên là một mảng các đối tượng `{label, value}`, hoặc một đối tượng thuần túy mà các khóa trở thành nhãn và các giá trị trở thành điểm dữ liệu.
- Tối đa 100 điểm dữ liệu. Tất cả giá trị phải bằng 0 hoặc lớn hơn.
- Đầu ra luôn là một ảnh PNG bất kể định dạng đầu vào.
