---
description: "Chuyển ảnh raster sang SVG với vector hóa đen trắng (potrace) và nhiều lớp toàn màu."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 240b5aa339e9
---

# Ảnh sang SVG {#image-to-svg}

Vector hóa ảnh raster thành SVG bằng các thuật toán tracing. Hỗ trợ tracing đen trắng (potrace) và vector hóa nhiều lớp toàn màu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| colorMode | string | Không | `"bw"` | Chế độ tracing: `bw` (đen trắng) hoặc `color` (nhiều lớp màu) |
| threshold | number | Không | 128 | Ngưỡng độ sáng cho chế độ B&W (0 đến 255). Các pixel bên dưới ngưỡng trở thành đen. |
| colorPrecision | number | Không | 6 | Độ chính xác lượng tử hóa màu cho chế độ màu (1 đến 16). Giá trị cao hơn tạo ra nhiều lớp màu riêng biệt hơn. |
| layerDifference | number | Không | 6 | Chênh lệch màu tối thiểu giữa các lớp trong chế độ màu (1 đến 128) |
| filterSpeckle | number | Không | 4 | Diện tích tối thiểu cho các hình được trace tính bằng pixel (1 đến 256). Xóa nhiễu/đốm. |
| pathMode | string | Không | `"spline"` | Làm mượt đường: `none` (răng cưa), `polygon` (đoạn thẳng), `spline` (đường cong mượt) |
| cornerThreshold | number | Không | 60 | Ngưỡng góc để phát hiện góc trong chế độ màu (0 đến 180 độ) |
| invert | boolean | Không | `false` | Đảo ngược ảnh trước khi trace (hoán đổi đen/trắng) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Vector hóa màu {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Ghi chú {#notes}

- Đầu ra luôn là tệp SVG bất kể định dạng đầu vào.
- Hỗ trợ các định dạng đầu vào HEIC, RAW, PSD, và SVG (tự động giải mã sang raster trước khi trace).
- Chế độ B&W dùng thuật toán potrace. Ảnh được chuyển sang grayscale trước, sau đó áp ngưỡng thành đen/trắng thuần trước khi trace.
- Chế độ màu dùng cách tiếp cận nhiều lớp: ảnh được lượng tử hóa thành các lớp màu, mỗi lớp được trace riêng và xếp chồng trong đầu ra SVG.
- Giá trị `filterSpeckle` thấp hơn giữ lại nhiều chi tiết hơn nhưng tạo ra tệp SVG lớn hơn với nhiều path hơn.
- Thiết lập `pathMode` ảnh hưởng đáng kể đến kích thước tệp: `none` tạo ra nhiều path nhất, `spline` tạo ra đầu ra mượt nhất (và thường nhỏ nhất).
- Để có kết quả tốt nhất với logo và biểu tượng, dùng chế độ B&W với đầu vào tương phản cao rõ ràng. Đối với ảnh chụp hoặc minh họa, dùng chế độ màu với `colorPrecision` cao hơn.
