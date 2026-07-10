---
description: "Gộp nhiều tệp thành một tệp lưu trữ ZIP duy nhất."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: c79e7c794d0f
---

# Create ZIP {#create-zip}

Gộp nhiều tệp thuộc bất kỳ loại nào thành một tệp lưu trữ ZIP duy nhất. Tên tệp trùng lặp được tự động khử trùng.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Nhận dữ liệu multipart form với hai tệp trở lên. Không cần trường settings.

## Parameters {#parameters}

Công cụ này không có tham số cấu hình. Tải lên 2-50 tệp thuộc bất kỳ loại nào để gộp.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Yêu cầu từ 2 đến 50 tệp đầu vào.
- Chấp nhận mọi loại tệp; không có giới hạn về định dạng đầu vào.
- Nếu nhiều tệp có cùng tên, chúng sẽ được tự động khử trùng bằng hậu tố số.
- Tệp lưu trữ đầu ra sử dụng nén ZIP tiêu chuẩn (deflate).
