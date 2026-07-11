---
description: "Thay đổi kích thước, tối ưu hóa, đổi tốc độ, đảo ngược, xoay và trích xuất khung hình từ GIF động trong một công cụ duy nhất."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: ff4c20205afa
---

# Công cụ GIF {#gif-tools}

Thay đổi kích thước, tối ưu hóa, đổi tốc độ, đảo ngược, trích xuất khung hình và xoay GIF động. Cung cấp nhiều chế độ thao tác trong một công cụ duy nhất.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Tham số {#parameters}

### Tham số chung {#common-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| mode | string | Không | `"resize"` | Chế độ thao tác: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Không | 0 | Số lần lặp cho GIF đầu ra (0 = vô hạn, 1-100 = số lần lặp hữu hạn) |

### Tham số chế độ Resize {#resize-mode-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| width | integer | Không | - | Chiều rộng đích tính bằng pixel (1 đến 16384) |
| height | integer | Không | - | Chiều cao đích tính bằng pixel (1 đến 16384) |
| percentage | number | Không | - | Thu phóng theo phần trăm (1 đến 500). Ghi đè width/height nếu được đặt. |

### Tham số chế độ Optimize {#optimize-mode-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| colors | number | Không | 256 | Số màu tối đa trong bảng màu (2 đến 256) |
| dither | number | Không | 1.0 | Cường độ khử răng cưa màu (0 đến 1, trong đó 0 tắt dithering) |
| effort | number | Không | 7 | Mức nỗ lực tối ưu hóa (1 đến 10, cao hơn = chậm hơn nhưng nhỏ hơn) |

### Tham số chế độ Speed {#speed-mode-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Không | 1.0 | Hệ số nhân tốc độ (0.1 đến 10). Giá trị > 1 tăng tốc, < 1 làm chậm. |

### Tham số chế độ Extract {#extract-mode-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| extractMode | string | Không | `"single"` | Chế độ trích xuất: `single`, `range`, `all` |
| frameNumber | number | Không | 0 | Chỉ số khung hình cần trích xuất trong chế độ `single` (bắt đầu từ 0) |
| frameStart | number | Không | 0 | Chỉ số khung hình bắt đầu cho chế độ `range` (bắt đầu từ 0) |
| frameEnd | number | Không | - | Chỉ số khung hình kết thúc cho chế độ `range` (bắt đầu từ 0, bao gồm cả chỉ số này) |
| extractFormat | string | Không | `"png"` | Định dạng cho khung hình được trích xuất: `png`, `webp` |

### Tham số chế độ Rotate {#rotate-mode-parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| angle | number | Không | - | Góc xoay: `90`, `180`, hoặc `270` độ |
| flipH | boolean | Không | `false` | Lật ngang |
| flipV | boolean | Không | `false` | Lật dọc |

## Ví dụ yêu cầu {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Tăng tốc {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Trích xuất một khung hình đơn {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Tuyến con Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Trả về siêu dữ liệu về một GIF động mà không xử lý nó.

### Yêu cầu Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Phản hồi Info {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Ghi chú {#notes}

- Sử dụng factory `createToolRoute` tiêu chuẩn cho điểm cuối xử lý chính.
- Điểm cuối info chỉ cần tải lên một tệp (không cần cài đặt).
- Ở chế độ `resize`, nếu `percentage` được cung cấp thì nó được ưu tiên hơn `width`/`height`. Việc thay đổi kích thước dùng `fit: inside` để giữ tỷ lệ khung hình.
- Ở chế độ `speed`, độ trễ khung hình được chia cho hệ số tốc độ. Độ trễ tối thiểu mỗi khung hình là 20ms (giới hạn của đặc tả GIF).
- Ở chế độ `reverse`, tham số `speedFactor` cũng khả dụng để đồng thời điều chỉnh tốc độ trong khi đảo ngược.
- Ở chế độ `extract` với `range` hoặc `all`, đầu ra là một tệp ZIP chứa từng khung hình riêng lẻ.
- Ở chế độ `rotate`, mỗi khung hình được xử lý riêng và lắp ghép lại thành một hoạt ảnh.
- Tham số `loop` kiểm soát số lần lặp của GIF đầu ra. Dùng 0 để lặp vô hạn.
- Trường `duration` trong phản hồi info là tổng thời lượng hoạt ảnh tính bằng mili-giây.
