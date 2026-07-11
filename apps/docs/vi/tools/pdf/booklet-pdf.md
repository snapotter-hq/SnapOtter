---
description: "Sắp xếp các trang PDF để gấp thành sách nhỏ."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: cbc44eec6d90
---

# Booklet PDF {#booklet-pdf}

Bố trí các trang để in hai mặt sao cho các tờ in ra có thể gấp thành một cuốn sách nhỏ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Chấp nhận dữ liệu form multipart với một tệp PDF và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Không | `2` | Số trang mỗi tờ: `2`, `4`, `6`, hoặc `8` |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Ghi chú {#notes}

- Mặc định `perSheet: 2` đặt hai trang cạnh nhau trên mỗi tờ, đây là bố cục sách nhỏ tiêu chuẩn cho in hai mặt.
- Các trang trống được thêm tự động nếu tổng số trang không phải là bội số của kích thước tờ.
- In đầu ra hai mặt theo kiểu đóng gáy cạnh ngắn, sau đó gấp và dập ghim.
