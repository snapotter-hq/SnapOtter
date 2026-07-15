---
description: "Cắt ảnh bằng cách chỉ định một vùng với vị trí và kích thước."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: da847123a2f2
---

# Cắt ảnh {#crop}

Cắt ảnh bằng cách xác định một vùng hình chữ nhật dựa trên vị trí và kích thước. Hỗ trợ cả đơn vị pixel và phần trăm.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| left | number | Có | - | Độ lệch X của vùng cắt (tính từ cạnh trái) |
| top | number | Có | - | Độ lệch Y của vùng cắt (tính từ cạnh trên) |
| width | number | Có | - | Chiều rộng của vùng cắt |
| height | number | Có | - | Chiều cao của vùng cắt |
| unit | string | Không | `"px"` | Đơn vị cho các giá trị: `px` hoặc `percent` |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Cắt bằng giá trị phần trăm:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Ghi chú {#notes}

- Vùng cắt phải nằm trong ranh giới ảnh. Nếu vùng vượt ra ngoài ảnh, yêu cầu sẽ thất bại.
- Khi dùng đơn vị `percent`, các giá trị biểu thị phần trăm của kích thước ảnh (ví dụ `left: 10` nghĩa là 10% tính từ cạnh trái).
- Định dạng đầu ra khớp với định dạng đầu vào.
- Định hướng EXIF được áp dụng tự động trước khi cắt, nên tọa độ tương ứng với định hướng đúng về mặt thị giác.
