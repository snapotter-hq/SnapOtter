---
description: "Cắt xén tất cả các trang của một PDF với lề đồng nhất."
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 0c265bd2c3ce
---

# Crop PDF {#crop-pdf}

Cắt xén tất cả các trang của một PDF bằng cách áp dụng một lề đồng nhất, cắt bỏ nội dung ở mỗi cạnh bằng nhau.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| margin | number | Không | `20` | Lề cắt xén đồng nhất tính bằng điểm (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Giá trị lề được tính bằng điểm PDF (1 điểm = 1/72 inch).
- Cùng một lề được áp dụng cho cả bốn cạnh của mọi trang.
- Lề `0` loại bỏ tất cả các lề cắt xén hiện có, hiển thị toàn bộ media box.
