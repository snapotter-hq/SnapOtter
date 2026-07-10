---
description: "Phát hiện ảnh trùng lặp và gần trùng lặp bằng băm cảm nhận (perceptual hashing)."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 30f8232aa4fe
---

# Tìm ảnh trùng lặp {#find-duplicates}

Tải lên nhiều ảnh để phát hiện các bản trùng lặp và gần trùng lặp bằng băm cảm nhận (dHash). Nhóm các ảnh tương tự với nhau, xác định phiên bản chất lượng tốt nhất trong mỗi nhóm, và tính toán không gian có thể tiết kiệm được.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Chấp nhận dữ liệu biểu mẫu multipart với nhiều tệp ảnh và một trường JSON `settings` tùy chọn.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| threshold | number | Không | `8` | Khoảng cách Hamming tối đa để coi các ảnh là trùng lặp (0 đến 20). Thấp hơn = khớp nghiêm ngặt hơn |

### Trường tệp {#file-fields}

Tải lên ít nhất 2 tệp ảnh trong yêu cầu multipart (tất cả dùng tên trường `file` hoặc bất kỳ tên trường nào cho các phần tệp).

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Trường phản hồi {#response-fields}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| totalImages | number | Số ảnh được phân tích thành công |
| duplicateGroups | array | Các nhóm ảnh trùng lặp |
| uniqueImages | number | Số ảnh không thuộc bất kỳ nhóm trùng lặp nào |
| spaceSaveable | number | Tổng số byte có thể tiết kiệm bằng cách xóa các bản trùng lặp không phải bản tốt nhất |
| skippedFiles | array | Các tệp không thể xử lý (kèm tên tệp và lý do) |

### Đối tượng nhóm trùng lặp {#duplicate-group-object}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| groupId | number | Định danh nhóm |
| files | array | Các ảnh trong nhóm trùng lặp này |

### Đối tượng tệp (trong một nhóm) {#file-object-within-a-group}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| filename | string | Tên tệp gốc |
| similarity | number | Phần trăm mức độ tương tự so với ảnh tham chiếu (ảnh đầu tiên trong nhóm) |
| width | number | Chiều rộng ảnh tính bằng pixel |
| height | number | Chiều cao ảnh tính bằng pixel |
| fileSize | number | Kích thước tệp tính bằng byte |
| format | string | Định dạng ảnh |
| isBest | boolean | Có phải đây là phiên bản chất lượng cao nhất hay không (nhiều pixel nhất, tệp lớn nhất) |
| thumbnail | string hoặc null | Thumbnail JPEG dạng Base64 (rộng 200px) để xem trước |

## Ghi chú {#notes}

- Sử dụng dHash 128-bit (64-bit hàng + 64-bit cột) để phát hiện tương tự cảm nhận. Cách này bắt được cả các bản trùng lặp qua thay đổi kích thước, nén lại và chỉnh sửa nhỏ.
- Ngưỡng biểu thị khoảng cách Hamming tối đa giữa các băm. Giá trị mặc định 8 bắt được các bản gần trùng lặp trong khi tránh dương tính giả. Dùng 0 cho chỉ giống hệt từng pixel, hoặc 15-20 cho khớp rất lỏng.
- Ảnh "tốt nhất" trong mỗi nhóm là ảnh có nhiều pixel nhất (chiều rộng x chiều cao), với kích thước tệp làm tiêu chí phân hạng phụ.
- Cần ít nhất 2 ảnh. Các tệp không vượt qua bước xác thực hoặc giải mã được báo cáo trong `skippedFiles` thay vì làm cho toàn bộ yêu cầu thất bại.
- Thumbnail là các bản xem trước JPEG rộng 200px được mã hóa dưới dạng data URI.
- Tất cả các định dạng phổ biến đều được hỗ trợ (HEIC, RAW, PSD, SVG được giải mã tự động).
