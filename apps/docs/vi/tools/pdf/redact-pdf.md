---
description: "Xóa vĩnh viễn các lần xuất hiện văn bản khỏi một PDF (biên tập ẩn thật đã xác minh)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 65563e784be8
---

# Redact PDF {#redact-pdf}

Xóa vĩnh viễn các lần xuất hiện văn bản được chỉ định khỏi một PDF bằng biên tập ẩn thật đã xác minh. Văn bản được biên tập ẩn hoàn toàn bị xóa khỏi tệp, không chỉ bị che bằng một hộp đen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| terms | string[] | Có | - | Các chuỗi văn bản cần biên tập ẩn (1-50 mục, mỗi mục tối đa 200 ký tự) |
| caseSensitive | boolean | Không | `false` | Việc so khớp có phân biệt chữ hoa chữ thường hay không |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Định dạng đầu vào được chấp nhận: `.pdf`.
- Đây là một công cụ nhanh (đồng bộ) trả về kết quả trực tiếp.
- Việc này thực hiện biên tập ẩn thật: văn bản khớp bị xóa khỏi luồng nội dung PDF, không chỉ bị che khuất về mặt hình ảnh.
- Trường `found` trong phản hồi cho biết có bao nhiêu lần xuất hiện đã được biên tập ẩn.
- Bạn có thể biên tập ẩn tối đa 50 mục trong một yêu cầu.
