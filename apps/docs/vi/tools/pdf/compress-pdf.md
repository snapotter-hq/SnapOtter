---
description: "Giảm kích thước tệp PDF bằng cách nén các hình ảnh nhúng."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: c51a44fc08cb
---

# Compress PDF {#compress-pdf}

Giảm kích thước tệp PDF bằng cách hạ độ phân giải các hình ảnh nhúng. Chọn giữa thanh trượt chất lượng hoặc kích thước tệp mục tiêu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Không | `"quality"` | Chế độ nén: `quality` hoặc `targetSize` |
| quality | integer | Không | `75` | Chất lượng nén, 1-100 (càng cao = nén càng ít). Dùng trong chế độ `quality` |
| targetSizeKb | number | Không | - | Kích thước tệp mục tiêu tính bằng kilobyte. Dùng trong chế độ `targetSize` |

## Example Request {#example-request}

Nén theo chất lượng:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Nén xuống kích thước mục tiêu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- Ở chế độ `quality`, giá trị thấp hơn tạo ra tệp nhỏ hơn nhưng hình ảnh suy giảm nhiều hơn.
- Ở chế độ `targetSize`, một tìm kiếm nhị phân tìm DPI cao nhất vừa với kích thước yêu cầu.
- Nếu việc nén khiến tệp lớn hơn, dữ liệu byte gốc được trả về nguyên vẹn.
- Nội dung văn bản và vector không bị ảnh hưởng; chỉ các hình ảnh raster nhúng mới bị hạ độ phân giải.
