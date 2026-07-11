---
description: "Chuyển đổi tất cả màu sắc trong một PDF sang thang xám."
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 83f4ecd38fca
---

# Grayscale PDF {#grayscale-pdf}

Chuyển đổi tất cả màu sắc trong một PDF sang thang xám, tạo ra một phiên bản đen trắng của tài liệu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF. Không cần trường `settings`.

## Parameters {#parameters}

Công cụ này không có tham số cài đặt. Tải trực tiếp tệp PDF lên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Tất cả các không gian màu (RGB, CMYK) được chuyển đổi sang thang xám, bao gồm hình ảnh nhúng, đồ họa vector và văn bản.
- Tệp đầu ra thường nhỏ hơn tệp gốc vì dữ liệu thang xám cần ít byte hơn cho mỗi pixel.
