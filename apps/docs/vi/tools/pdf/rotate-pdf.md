---
description: "Xoay các trang trong một PDF 90, 180 hoặc 270 độ."
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: c039180e910f
---

# Rotate PDF {#rotate-pdf}

Xoay tất cả hoặc các trang đã chọn trong một PDF theo một góc được chỉ định.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| angle | integer | Không | `90` | Góc xoay: `90`, `180`, hoặc `270` |
| range | string | Không | `"1-z"` | Phạm vi trang theo cú pháp qpdf, ví dụ `"1-5,8"` (`"1-z"` = tất cả các trang) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Việc xoay theo chiều kim đồng hồ.
- Phạm vi trang dùng cú pháp qpdf: `1-5` cho các trang 1 đến 5, `z` cho trang cuối cùng, và dấu phẩy để kết hợp các phạm vi.
- Phạm vi mặc định `"1-z"` xoay tất cả các trang.
