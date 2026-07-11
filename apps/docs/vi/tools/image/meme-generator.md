---
description: "Tạo meme với mẫu có sẵn hoặc ảnh tùy chỉnh, hộp văn bản được tạo kiểu và các tùy chọn phông chữ."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 5e6ed702291f
---

# Meme Generator {#meme-generator}

Tạo meme bằng các mẫu tích hợp sẵn hoặc ảnh tùy chỉnh. Thêm văn bản với kiểu meme cổ điển (chữ đậm, có viền), nhiều bố cục dựng sẵn và các lựa chọn phông chữ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Chấp nhận một trong hai:
- **Multipart form data** với một tệp ảnh và một trường JSON `settings` (chế độ ảnh tùy chỉnh)
- **JSON body** với một `templateId` (chế độ mẫu, không cần tải tệp lên)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | ID mẫu meme tích hợp sẵn. Nếu được cung cấp, không cần tải ảnh lên |
| textLayout | string | No | `"top-bottom"` | Bố cục hộp văn bản: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | Mảng các đối tượng hộp văn bản với các trường `id` và `text` |
| fontFamily | string | No | `"anton"` | Phông chữ: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | Cỡ phông chữ tính bằng pixel (8 đến 200). Tự động tính toán nếu bỏ qua |
| textColor | string | No | `"#ffffff"` | Màu tô của văn bản |
| strokeColor | string | No | `"#000000"` | Màu viền/đường bao của văn bản |
| textAlign | string | No | `"center"` | Căn chỉnh văn bản: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | Chuyển văn bản thành chữ hoa |

### Text Boxes {#text-boxes}

Mỗi mục trong mảng `textBoxes` nên có:

| Field | Type | Description |
|-------|------|-------------|
| id | string | Định danh hộp khớp với bố cục (ví dụ: `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Văn bản meme cần hiển thị |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

Ảnh tùy chỉnh với văn bản trên và dưới:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Dùng mẫu tích hợp sẵn (JSON body, không tải tệp lên):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- Bắt buộc phải có `templateId` hoặc một tệp ảnh được tải lên. Nếu cung cấp cả hai, mẫu sẽ được dùng.
- Các mẫu tự định nghĩa vị trí hộp văn bản riêng; tham số `textLayout` bị bỏ qua khi dùng mẫu.
- Văn bản được kết xuất dưới dạng SVG với đường bao viền để tạo kiểu meme cổ điển.
- Cỡ phông chữ được tự động tính để vừa với hộp văn bản nếu không được đặt tường minh.
- Các hộp văn bản trống sẽ bị bỏ qua (không kết xuất nếu tất cả các hộp đều trống).
- Tên tệp đầu ra bao gồm ID mẫu khi dùng mẫu (ví dụ: `meme-drake.png`).
- Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
