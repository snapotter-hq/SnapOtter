---
description: "Đổi kích thước mọi trang của PDF thành A4, Letter, nhãn vận chuyển 4x6 inch hoặc kích thước tùy chỉnh."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 956cd8ad8a29
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Thay đổi kích thước trang của mọi trang trong một PDF. Nội dung được co giãn cho vừa trang mới và căn giữa, nên văn bản, đồ họa vector và mã vạch vẫn sắc nét. Dùng để biến một nhãn vận chuyển thành trang 4x6 inch cho máy in nhiệt, hoặc chuyển tài liệu giữa A4 và US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Nhận dữ liệu multipart form với một tệp PDF và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Kích thước đích: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal`, hoặc `custom` |
| width | number | No | `4` | Chiều rộng trang tùy chỉnh, dùng khi `pageSize` là `custom` |
| height | number | No | `6` | Chiều cao trang tùy chỉnh, dùng khi `pageSize` là `custom` |
| unit | string | No | `"in"` | Đơn vị cho kích thước tùy chỉnh: `in` hoặc `mm` |
| keepOrientation | boolean | No | `false` | Xoay kích thước đích cho khớp với hướng của từng trang thay vì ép cố định rộng nhân cao |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Các trang được co giãn cho vừa, không bao giờ bị kéo giãn. Khi tỉ lệ khung hình khác nhau, phần không gian còn thừa được để trống.
- Đổi kích thước không cắt xén. Một nhãn in trên một phần tư trang Letter hoặc A4 vẫn chỉ chiếm một phần tư trang mới.
- Kích thước tùy chỉnh phải từ 0,5-200 inch (12,7-5080 mm) ở mỗi cạnh.
- Trang được đổi kích thước từ crop box của nó nếu có, nên một trang đã bị cắt chỉ giữ lại vùng đã cắt.
