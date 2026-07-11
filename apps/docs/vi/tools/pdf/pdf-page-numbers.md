---
description: "Thêm số trang vào mọi trang của một PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 23770de9054d
---

# PDF Page Numbers {#pdf-page-numbers}

Thêm số trang dạng "Page N of M" vào mọi trang của một PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| position | string | Không | `"bc"` | Vị trí đặt số trang: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Không | `10` | Cỡ chữ tính bằng điểm (6-24) |

### Position Values {#position-values}

- `tl` trên-trái, `tc` trên-giữa, `tr` trên-phải
- `bl` dưới-trái, `bc` dưới-giữa, `br` dưới-phải

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Số trang được hiển thị theo định dạng "Page 1 of 10".
- Số được thêm vào mọi trang, bao gồm bất kỳ trang tiêu đề hoặc trang bìa hiện có nào.
- Vị trí mặc định `"bc"` đặt số ở giữa dưới của mỗi trang.
