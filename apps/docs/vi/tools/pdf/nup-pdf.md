---
description: "Sắp xếp nhiều trang PDF trên mỗi tờ (2-up, 4-up, v.v.)."
i18n_source_hash: 972bf997c95c
i18n_provenance: human
i18n_output_hash: 1012fd595786
---

# Số trang mỗi tờ (N-up) {#n-up-pdf}

Sắp xếp nhiều trang trên mỗi tờ để tiết kiệm giấy khi in, chẳng hạn như bố cục 2-up hoặc 4-up.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Không | `2` | Số trang mỗi tờ: `2`, `3`, `4`, `8`, `9`, `12`, hoặc `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- Các trang được sắp xếp theo thứ tự đọc (trái sang phải, trên xuống dưới).
- Kích thước trang đầu ra khớp với bản gốc; các trang riêng lẻ được thu nhỏ để vừa với lưới.
- Một tài liệu 20 trang với `perSheet: 4` tạo ra đầu ra 5 trang.
