---
description: "So sánh hai ảnh cạnh nhau với hình ảnh trực quan hóa khác biệt ở cấp độ pixel và điểm tương đồng."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: de173dd87507
---

# So sánh ảnh {#image-compare}

Tải lên hai ảnh để tính bản đồ khác biệt ở cấp độ pixel và tỷ lệ phần trăm tương đồng dạng số. Đầu ra là một ảnh khác biệt làm nổi bật các vùng thay đổi bằng màu đỏ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compare`

Chấp nhận dữ liệu form multipart với **hai** tệp ảnh. Không cần trường thiết lập.

## Tham số {#parameters}

Công cụ này không có tham số cấu hình. Tải lên đúng hai tệp ảnh.

| Trường | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------------|
| file (thứ nhất) | file | Có | Ảnh thứ nhất |
| file (thứ hai) | file | Có | Ảnh thứ hai |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Các trường phản hồi {#response-fields}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| jobId | string | Định danh tác vụ để tải xuống ảnh khác biệt |
| similarity | number | Tỷ lệ phần trăm tương đồng giữa hai ảnh (0 đến 100) |
| dimensions | object | Chiều rộng và chiều cao dùng để so sánh |
| downloadUrl | string | URL để tải xuống ảnh khác biệt đã tạo |
| originalSize | number | Tổng kích thước của cả hai ảnh đầu vào tính bằng byte |
| processedSize | number | Kích thước ảnh khác biệt đầu ra tính bằng byte |

## Ghi chú {#notes}

- Cả hai ảnh được thay đổi về cùng kích thước (lấy giá trị lớn nhất của mỗi trục) trước khi so sánh.
- Ảnh khác biệt làm nổi bật khác biệt bằng màu đỏ với độ mờ tỷ lệ với mức độ thay đổi. Các pixel giống hệt hoặc gần giống hệt (khác biệt < 10) hiển thị dưới dạng phiên bản bán trong suốt của ảnh gốc.
- Độ tương đồng được tính bằng nghịch đảo của mức khác biệt pixel trung bình trên toàn bộ pixel, biểu diễn dưới dạng phần trăm.
- Độ tương đồng 100% nghĩa là các ảnh giống hệt nhau ở cấp pixel (tại độ phân giải so sánh).
- Đầu ra khác biệt luôn ở định dạng PNG bất kể định dạng đầu vào.
- Cả hai ảnh được xác thực và giải mã (hỗ trợ HEIC, RAW, PSD, SVG) trước khi so sánh.
- Định hướng EXIF được áp dụng tự động cho cả hai ảnh trước khi xử lý.
