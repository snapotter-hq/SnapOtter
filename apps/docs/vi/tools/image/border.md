---
description: "Thêm viền, khoảng đệm, góc bo tròn và bóng đổ vào hình ảnh theo một thứ tự có thể dự đoán và kiểm soát được."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 61e787776e5d
---

# Border & Frame {#border-frame}

Thêm viền, khoảng đệm, góc bo tròn và bóng đổ vào hình ảnh. Công cụ áp dụng các hiệu ứng theo thứ tự: khoảng đệm, viền, bán kính bo góc, rồi bóng đổ.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | Độ dày viền tính bằng pixel (0 đến 2000) |
| borderColor | string | No | `"#000000"` | Màu viền dạng hex (ví dụ `#FF0000`) |
| padding | number | No | 0 | Khoảng đệm bên trong giữa hình ảnh và viền tính bằng pixel (0 đến 200) |
| paddingColor | string | No | `"#FFFFFF"` | Màu lấp khoảng đệm dạng hex |
| cornerRadius | number | No | 0 | Bán kính bo góc tính bằng pixel (0 đến 2000) |
| shadow | boolean | No | `false` | Có thêm bóng đổ hay không |
| shadowBlur | number | No | 15 | Bán kính làm mờ bóng đổ (1 đến 200) |
| shadowOffsetX | number | No | 0 | Độ lệch ngang của bóng đổ (-50 đến 50) |
| shadowOffsetY | number | No | 5 | Độ lệch dọc của bóng đổ (-50 đến 50) |
| shadowColor | string | No | `"#000000"` | Màu bóng đổ dạng hex |
| shadowOpacity | number | No | 40 | Phần trăm độ mờ của bóng đổ (0 đến 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- Sử dụng factory `createToolRoute` tiêu chuẩn. Chấp nhận một tệp hình ảnh duy nhất qua tải lên multipart.
- Hỗ trợ các định dạng đầu vào HEIC, RAW, PSD và SVG (được giải mã tự động).
- Thứ tự xử lý: khoảng đệm được thêm trước, rồi viền bọc quanh, rồi bán kính bo góc được áp dụng, rồi bóng đổ được ghép vào.
- Khi `cornerRadius` hoặc `shadow` được bật, đầu ra buộc phải là PNG (bất kể định dạng đầu vào) để giữ độ trong suốt. Các định dạng hỗ trợ kênh alpha (PNG, WebP, AVIF) giữ nguyên định dạng gốc.
- Bóng đổ nhận biết hình dạng: nó bám theo các góc bo tròn thay vì tạo một bóng đổ hình chữ nhật.
- Đặt `borderWidth` bằng 0 và chỉ dùng `cornerRadius` + `shadow` tạo hiệu ứng bóng đổ bo tròn không khung.
