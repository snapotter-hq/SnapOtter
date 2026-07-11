---
description: "Biến các ảnh chụp màn hình đơn giản thành hình ảnh trau chuốt với nền dải màu, khung thiết bị, bóng đổ và kích thước cho mạng xã hội."
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: 6b416f07ac8b
---

# Beautify Screenshot {#beautify-screenshot}

Thêm nền dải màu, khung thiết bị, bóng đổ, hình mờ và kích thước cho mạng xã hội vào các ảnh chụp màn hình. Lý tưởng để tạo hình ảnh trau chuốt cho tiếp thị sản phẩm, mạng xã hội và tài liệu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | Loại nền: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | Màu nền đơn sắc (dùng khi `backgroundType` là `solid`) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | Các điểm dừng màu của dải màu (tối thiểu 2). Mỗi điểm dừng có `color` (hex) và `position` (0-100). |
| gradientAngle | number | No | 135 | Góc dải màu theo độ (0 đến 360) |
| padding | number | No | 64 | Khoảng đệm quanh hình ảnh tính bằng pixel (0 đến 256) |
| borderRadius | number | No | 12 | Bán kính bo góc trên ảnh chụp màn hình (0 đến 64) |
| shadowPreset | string | No | `"subtle"` | Cài đặt sẵn bóng đổ: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | Bán kính làm mờ bóng đổ tùy chỉnh (0 đến 100, dùng khi `shadowPreset` là `custom`) |
| shadowOffsetX | number | No | 0 | Độ lệch ngang tùy chỉnh của bóng đổ (-50 đến 50) |
| shadowOffsetY | number | No | 10 | Độ lệch dọc tùy chỉnh của bóng đổ (-50 đến 50) |
| shadowColor | string | No | `"#000000"` | Màu bóng đổ tùy chỉnh dạng hex |
| shadowOpacity | number | No | 30 | Độ mờ bóng đổ tùy chỉnh (0 đến 100) |
| frame | string | No | `"none"` | Khung thiết bị hoặc cửa sổ: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | Văn bản tiêu đề hiển thị trong thanh tiêu đề khung cửa sổ |
| socialPreset | string | No | `"none"` | Đổi kích thước sang kích thước mạng xã hội: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | Lớp phủ văn bản hình mờ tùy chọn |
| watermarkPosition | string | No | `"bottom-right"` | Vị trí hình mờ: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | Độ mờ hình mờ (0 đến 100) |
| outputFormat | string | No | `"png"` | Định dạng đầu ra: `png`, `jpeg`, `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- Chấp nhận hai trường tệp: `file` (bắt buộc, ảnh chụp màn hình chính) và `backgroundImage` (tùy chọn, dùng khi `backgroundType` là `image`).
- Hỗ trợ các định dạng đầu vào HEIC, RAW, PSD và SVG (được giải mã tự động).
- Các cài đặt sẵn bóng đổ ánh xạ tới các giá trị cụ thể:
  - `subtle`: blur 20, offsetY 4, độ mờ 20%
  - `medium`: blur 40, offsetY 10, độ mờ 35%
  - `dramatic`: blur 80, offsetY 20, độ mờ 50%
- Các cài đặt sẵn cho mạng xã hội đổi kích thước đầu ra cuối cùng để vừa với kích thước đích bằng chế độ `contain`:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- Khung thiết bị (`iphone`, `macbook`, `ipad`) áp dụng một viền phần cứng quanh hình ảnh và bỏ qua cài đặt `borderRadius`.
- Khi cần độ trong suốt (bóng đổ, bán kính bo góc, khung thiết bị hoặc nền trong suốt), đầu ra buộc phải là PNG ngay cả khi `jpeg` được chọn.
- Nền hình ảnh không được hỗ trợ ở chế độ pipeline/batch.
