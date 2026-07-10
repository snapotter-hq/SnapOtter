---
description: "Chuyển đổi ảnh thành data URI base64 để nhúng vào HTML, CSS và nhiều nơi khác."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 17e30396b4e5
---

# Ảnh sang Base64 {#image-to-base64}

Chuyển đổi một hoặc nhiều ảnh thành chuỗi được mã hóa base64 và data URI. Hỗ trợ chuyển đổi định dạng tùy chọn, kiểm soát chất lượng và thay đổi kích thước. Hữu ích để nhúng ảnh trực tiếp vào HTML, CSS, JSON hoặc mẫu email.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Chấp nhận dữ liệu biểu mẫu multipart với một hoặc nhiều tệp ảnh và một trường JSON `settings` tùy chọn.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Không | `"original"` | Chuyển đổi trước khi mã hóa: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Không | `80` | Chất lượng đầu ra cho các định dạng mất dữ liệu (1 đến 100) |
| maxWidth | number | Không | `0` | Chiều rộng tối đa tính bằng pixel (0 = không thay đổi kích thước, sẽ không phóng to) |
| maxHeight | number | Không | `0` | Chiều cao tối đa tính bằng pixel (0 = không thay đổi kích thước, sẽ không phóng to) |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Nhiều tệp:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Trường phản hồi {#response-fields}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| results | array | Các ảnh đã chuyển đổi thành công |
| errors | array | Các ảnh không xử lý được (kèm tên tệp và thông báo lỗi) |

### Đối tượng Result {#result-object}

| Trường | Kiểu | Mô tả |
|-------|------|-------------|
| filename | string | Tên tệp gốc |
| mimeType | string | Kiểu MIME của đầu ra được mã hóa |
| width | number | Chiều rộng cuối cùng tính bằng pixel (sau bất kỳ thay đổi kích thước nào) |
| height | number | Chiều cao cuối cùng tính bằng pixel (sau bất kỳ thay đổi kích thước nào) |
| originalSize | number | Kích thước tệp gốc tính bằng byte |
| encodedSize | number | Kích thước của chuỗi base64 tính bằng byte |
| overheadPercent | number | Phần trăm chênh lệch kích thước so với bản gốc (dương = lớn hơn, âm = nhỏ hơn) |
| base64 | string | Dữ liệu ảnh mã hóa base64 thô |
| dataUri | string | Data URI hoàn chỉnh sẵn sàng dùng trong thuộc tính `src` |

## Ghi chú {#notes}

- Mã hóa Base64 thường làm tăng kích thước khoảng 33% so với tệp nhị phân. Trường `overheadPercent` cho biết chênh lệch thực tế.
- Khi `outputFormat` là `"original"`, các tệp HEIC/HEIF được chuyển sang JPEG (vì trình duyệt không thể hiển thị HEIC trong data URI).
- Các tùy chọn `maxWidth` và `maxHeight` thay đổi kích thước bằng `fit: inside` với `withoutEnlargement`, nên các ảnh nhỏ hơn kích thước đã chỉ định sẽ không được phóng to.
- Nhiều tệp có thể được xử lý trong một yêu cầu duy nhất. Mỗi tệp được xử lý độc lập, và các lỗi không ngăn các tệp khác thành công.
- Các tệp SVG được truyền qua dưới dạng `image/svg+xml` mà không mã hóa lại (trừ khi yêu cầu chuyển đổi định dạng).
- Đây là một điểm cuối chỉ đọc. Nó không tạo ra tệp có thể tải xuống hoặc một `jobId`. Dữ liệu base64 được trả về trực tiếp trong thân phản hồi.
