---
description: "Xóa bảo vệ bằng mật khẩu khỏi một PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 52883f2986e4
---

# Unlock PDF {#unlock-pdf}

Xóa bảo vệ bằng mật khẩu khỏi một PDF được mã hóa bằng cách cung cấp mật khẩu đúng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| password | string | Có | - | Mật khẩu để giải mã PDF (1-256 ký tự) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Phải cung cấp mật khẩu đúng; mật khẩu sai trả về lỗi 400.
- Cả mật khẩu người dùng hoặc mật khẩu chủ sở hữu đều dùng được để giải mã.
- Mật khẩu được che khỏi nhật ký kiểm toán.
