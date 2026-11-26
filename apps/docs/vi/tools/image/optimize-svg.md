---
description: "Thu nhỏ tệp SVG bằng svgo và giữ kết quả dưới dạng SVG vector, với các tùy chọn về độ chính xác, nhiều lượt chạy, siêu dữ liệu và định dạng."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 3cab5008f857
i18n_hash_version: 2
---

# Tối ưu SVG {#optimize-svg}

Giảm kích thước tệp SVG bằng cách loại bỏ dữ liệu thừa của trình chỉnh sửa, thuộc tính dư thừa và các chữ số thập phân không cần thiết, rồi tải kết quả về dưới dạng SVG. Khác với “Tối ưu cho web”, đầu ra không bao giờ bị raster hóa.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Chấp nhận dữ liệu biểu mẫu multipart với một tệp `.svg` hoặc `.svgz` và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | Số chữ số thập phân được giữ trong dữ liệu đường dẫn và các số (0 đến 8). Giá trị thấp hơn cho tệp nhỏ hơn và đường cong thô hơn một chút. |
| multipass | boolean | No | `true` | Chạy bộ tối ưu nhiều lần cho đến khi đầu ra không nhỏ thêm nữa |
| removeMetadata | boolean | No | `true` | Xóa chú thích, `<metadata>`, `<desc>` và dữ liệu riêng của trình chỉnh sửa. Tắt để giữ lại chúng. |
| pretty | boolean | No | `false` | Thụt lề đầu ra để dễ đọc thay vì thu gọn thành vài dòng |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- Đầu vào phải là tệp SVG hoặc SVGZ. Ảnh raster bị từ chối với `400` và mã `IMAGE_UNDECODABLE`.
- Đầu vào `.svgz` được giải nén trước, và đầu ra luôn là `.svg` thông thường.
- SVG bị giới hạn 2 MB sau khi giải nén. Tệp lớn hơn bị từ chối với `400` và mã `SVG_TOO_LARGE`.
- `viewBox` và `<title>` luôn được giữ lại, nên hình vẽ vẫn co giãn được và giữ tên truy cập.
- Cả đầu vào lẫn đầu ra đều đi qua bộ làm sạch SVG, bộ này loại bỏ script và nội dung hoạt động khác.
- Giảm `precision` giúp tiết kiệm dung lượng nhiều nhất với hình có nhiều đường dẫn. Hãy kiểm tra kết quả bằng mắt ở mức 0 đến 2.
