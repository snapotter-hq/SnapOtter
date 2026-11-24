---
description: "Đổi tên nhiều ảnh bằng một mẫu khuôn dạng và tải xuống dưới dạng ZIP."
i18n_source_hash: 160ace6b0d70
i18n_provenance: human
i18n_output_hash: a4147e32af58
---

# Bulk Rename {#bulk-rename}

Đổi tên nhiều ảnh bằng một mẫu khuôn dạng với các trình giữ chỗ cho chỉ số, chỉ số được đệm và tên tệp gốc. Trả về một kho lưu trữ ZIP chứa tất cả ảnh đã đổi tên.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Chấp nhận dữ liệu biểu mẫu multipart với nhiều tệp ảnh và một trường JSON `settings`.

Mọi tệp tải lên đều phải là ảnh. Phần đầu của từng tệp được kiểm tra trước khi ZIP bắt đầu, sau đó các byte được nén nguyên trạng (không mã hóa lại). Nếu có tệp không phải ảnh được nhận dạng, hoặc vượt quá `MAX_MEGAPIXELS`, toàn bộ yêu cầu sẽ thất bại với `400` và một lỗi nêu tên tệp đó, ví dụ `Invalid file "notes.txt": Unrecognized image format`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | Mẫu đặt tên với các trình giữ chỗ (tối đa 1000 ký tự) |
| startIndex | number | No | `1` | Số chỉ số bắt đầu |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | Số tuần tự bắt đầu từ `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Số tuần tự được đệm bằng số không | `01`, `02`, `03` |
| `{{original}}` | Tên tệp gốc không có phần mở rộng | `photo`, `IMG_001` |

Phần mở rộng tệp gốc luôn được giữ nguyên.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Điều này tạo ra: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Sử dụng tên tệp gốc:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Điều này tạo ra: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

Phản hồi là một tệp ZIP được truyền trực tiếp (không phải phản hồi JSON). Các tiêu đề phản hồi là:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- Công cụ này không xử lý hình ảnh. Nó chỉ đổi tên tệp và đóng gói chúng vào một kho lưu trữ ZIP.
- Độ rộng đệm số không cho `{{padded}}` được xác định tự động dựa trên tổng số tệp (ví dụ 100 tệp sẽ dùng đệm 3 chữ số: `001`, `002`, v.v.).
- Phần mở rộng tệp được giữ nguyên từ tên tệp gốc.
- Tên tệp được làm sạch để loại bỏ các ký tự không an toàn.
- Phải cung cấp ít nhất một tệp.
