---
description: "Chia một tệp CSV thành các tệp nhỏ hơn theo số hàng."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 86db44cf0346
---

# Split CSV {#split-csv}

Chia một tệp CSV hoặc TSV lớn thành các tệp nhỏ hơn theo số hàng. Trả về một kho lưu trữ ZIP chứa các phần.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp CSV và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | Số hàng dữ liệu trên mỗi tệp đầu ra (1-1.000.000) |
| keepHeader | boolean | No | `true` | Lặp lại hàng tiêu đề trong mỗi tệp đầu ra |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- Đầu ra luôn là một kho lưu trữ ZIP chứa các phần CSV đã chia, được đặt tên theo thứ tự (ví dụ `part-1.csv`, `part-2.csv`).
- Khi `keepHeader` là `true`, mỗi phần bao gồm hàng tiêu đề gốc để mỗi tệp có thể được dùng độc lập.
- Cả tệp CSV và TSV đều được chấp nhận làm đầu vào.
- Số hàng chỉ tính các hàng dữ liệu; hàng tiêu đề không được tính.
