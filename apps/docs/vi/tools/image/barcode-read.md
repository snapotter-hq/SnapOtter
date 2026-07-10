---
description: "Quét hình ảnh để tìm mã QR, mã vạch và mã 2D với đầu ra được chú thích."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: dbc255ad4a19
---

# Barcode Reader {#barcode-reader}

Quét các hình ảnh được tải lên để tìm mọi loại mã vạch và mã QR. Trả về văn bản đã giải mã, loại mã vạch và dữ liệu vị trí cho mỗi mã được phát hiện. Cũng tạo một hình ảnh được chú thích với các hộp giới hạn có màu quanh những mã được phát hiện.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp hình ảnh và một trường JSON `settings` tùy chọn.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | Bật chế độ quét tích cực cho các mã vạch khó đọc hơn (chậm hơn nhưng kỹ càng hơn) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | Tên tệp gốc |
| barcodes | array | Mảng các đối tượng mã vạch được phát hiện |
| annotatedUrl | string or null | URL để tải hình ảnh được chú thích (null nếu không tìm thấy mã vạch) |
| previewUrl | string or null | Giống annotatedUrl (để tương thích xem trước ở frontend) |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | Định dạng mã vạch (QRCode, EAN-13, Code128, DataMatrix, PDF417, v.v.) |
| text | string | Nội dung đã giải mã của mã vạch |
| position | object | Hộp giới hạn với tọa độ topLeft, topRight, bottomLeft, bottomRight |

## Supported Barcode Types {#supported-barcode-types}

Mã vạch 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Mã vạch 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notes {#notes}

- Sử dụng thư viện zxing-wasm để phát hiện mã vạch.
- Hình ảnh được chú thích phủ lên các hộp giới hạn đa giác có màu và nhãn được đánh số trên mỗi mã vạch được phát hiện.
- Có thể phát hiện tối đa 255 mã vạch trong một hình ảnh.
- Nếu không tìm thấy mã vạch nào, `barcodes` là một mảng rỗng và `annotatedUrl` là null.
- Chế độ `tryHarder` thực hiện quét kỹ càng hơn với chi phí là thời gian xử lý. Tắt nó để xử lý nhanh hơn các mã vạch sạch, được căn chỉnh tốt.
- Đầu ra được chú thích luôn ở định dạng PNG.
- Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi quét.
- Hướng EXIF được tự động áp dụng trước khi xử lý.
