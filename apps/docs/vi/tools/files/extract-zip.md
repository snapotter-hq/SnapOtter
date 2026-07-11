---
description: "Trích xuất tệp từ tệp lưu trữ ZIP một cách an toàn với bảo vệ chống bom nén."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 191c847722a5
---

# Extract ZIP {#extract-zip}

Trích xuất tệp từ tệp lưu trữ ZIP một cách an toàn. Tệp lưu trữ chỉ chứa một tệp sẽ trả về trực tiếp tệp bên trong; tệp lưu trữ chứa nhiều tệp sẽ trả về một ZIP phẳng với nội dung đã trích xuất.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Nhận dữ liệu multipart form với một tệp ZIP. Không cần trường settings.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên một tệp `.zip` để trích xuất.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Chỉ các tệp `.zip` được chấp nhận làm đầu vào.
- Nếu tệp lưu trữ chứa một tệp duy nhất, tệp đó được trả về trực tiếp (không bọc trong ZIP).
- Nếu tệp lưu trữ chứa nhiều tệp, một ZIP phẳng được trả về với tất cả tệp được trích xuất ra cấp gốc (cấu trúc thư mục lồng nhau bị làm phẳng).
- Bảo vệ chống bom nén tích hợp sẵn sẽ từ chối các tệp lưu trữ có tỷ lệ nén hoặc số lượng tệp quá lớn để ngăn cạn kiệt tài nguyên.
