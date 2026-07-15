---
description: "Giảm kích thước tệp ảnh theo mức chất lượng hoặc theo kích thước tệp mục tiêu."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: af62b2e13a07
---

# Nén ảnh {#compress}

Giảm kích thước tệp ảnh bằng cách chỉ định mức chất lượng hoặc kích thước tệp mục tiêu tính bằng kilobyte. Công cụ dùng tìm kiếm nhị phân lặp để đạt mục tiêu kích thước một cách chính xác.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Không | `"quality"` | Chế độ nén: `quality` hoặc `targetSize` |
| quality | number | Không | `80` | Mức chất lượng (1-100). Dùng khi chế độ là `quality`. |
| targetSizeKb | number | Không | - | Kích thước tệp mục tiêu tính bằng kilobyte. Dùng khi chế độ là `targetSize`. |

## Ví dụ yêu cầu {#example-request}

Nén về chất lượng 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Nén về kích thước mục tiêu 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Ghi chú {#notes}

- Ở chế độ `quality`, giá trị thấp hơn tạo tệp nhỏ hơn với nhiều nhiễu nén hơn. Giá trị 80 là mặc định tốt cho dùng trên web.
- Ở chế độ `targetSize`, engine thực hiện nén lặp để đạt gần mục tiêu nhất có thể mà không vượt quá.
- Định dạng đầu ra khớp với định dạng đầu vào. Việc nén áp dụng cho mã hóa gốc của định dạng (ví dụ chất lượng JPEG cho tệp JPEG, chất lượng WebP cho tệp WebP).
- Nếu chất lượng mặc định (80) chấp nhận được, bạn có thể bỏ hoàn toàn tham số `quality`.
