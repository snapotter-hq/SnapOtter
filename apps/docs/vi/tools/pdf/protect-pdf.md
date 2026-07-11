---
description: "Thêm bảo vệ bằng mật khẩu với mã hóa AES-256 cho một PDF."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 362d50446184
---

# Protect PDF {#protect-pdf}

Thêm bảo vệ bằng mật khẩu cho một PDF bằng mã hóa AES-256.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| userPassword | string | Có | - | Mật khẩu cần thiết để mở PDF (1-256 ký tự) |
| ownerPassword | string | Không | Giống `userPassword` | Mật khẩu chủ sở hữu cho quyền hạn (1-256 ký tự) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Mã hóa dùng AES-256.
- Nếu `ownerPassword` bị bỏ qua, nó mặc định là cùng giá trị với `userPassword`.
- Mật khẩu được che khỏi nhật ký kiểm toán.
- PDF được mã hóa yêu cầu mật khẩu người dùng để mở và mật khẩu chủ sở hữu (nếu khác) để có đầy đủ quyền hạn.
