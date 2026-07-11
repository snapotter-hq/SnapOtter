---
description: "Ghép nhiều ảnh thành các bố cục ghép ảnh dạng lưới với hơn 25 mẫu, khoảng cách và bo góc điều chỉnh được, cùng thao tác di chuyển và phóng to theo từng ô."
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: d0c4f3ac88f9
---

# Ghép ảnh / Lưới {#collage-grid}

Ghép nhiều ảnh thành các bố cục ghép ảnh dạng lưới đẹp mắt với hơn 25 mẫu. Hỗ trợ bố cục từ 2 đến 9 ảnh với khoảng cách, bán kính bo góc, màu nền tùy chỉnh và điều khiển di chuyển/phóng to theo từng ô.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| templateId | string | Có | - | ID bố cục mẫu (ví dụ `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | Không | - | Mảng thiết lập theo từng ô với `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Có | - | Chỉ số của ảnh đặt vào ô này (bắt đầu từ 0) |
| cells[].panX | number | Không | 0 | Độ lệch di chuyển ngang (-100 đến 100) |
| cells[].panY | number | Không | 0 | Độ lệch di chuyển dọc (-100 đến 100) |
| cells[].zoom | number | Không | 1 | Mức phóng to (1 đến 10) |
| cells[].objectFit | string | Không | `"cover"` | Cách ảnh lấp đầy ô: `cover` hoặc `contain` |
| gap | number | Không | 8 | Khoảng cách giữa các ô tính bằng pixel (0 đến 500) |
| cornerRadius | number | Không | 0 | Bán kính bo góc cho mỗi ô tính bằng pixel (0 đến 500) |
| backgroundColor | string | Không | `"#FFFFFF"` | Màu nền dạng hex hoặc `"transparent"` |
| aspectRatio | string | Không | `"free"` | Tỷ lệ khung hình canvas: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | Không | `"png"` | Định dạng đầu ra: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | Không | 90 | Chất lượng đầu ra (1 đến 100) |

## Các mẫu có sẵn {#available-templates}

| ID mẫu | Số ảnh | Bố cục |
|-------------|--------|--------|
| `2-h-equal` | 2 | Hai cột bằng nhau |
| `2-v-equal` | 2 | Hai hàng bằng nhau |
| `2-h-left-large` | 2 | Trái 2/3, phải 1/3 |
| `2-h-right-large` | 2 | Trái 1/3, phải 2/3 |
| `3-left-large` | 3 | Lớn bên trái, hai ảnh xếp chồng bên phải |
| `3-right-large` | 3 | Hai ảnh xếp chồng bên trái, lớn bên phải |
| `3-top-large` | 3 | Lớn ở trên, hai cột ở dưới |
| `3-h-equal` | 3 | Ba cột bằng nhau |
| `3-v-equal` | 3 | Ba hàng bằng nhau |
| `4-grid` | 4 | Lưới 2x2 |
| `4-left-large` | 4 | Lớn bên trái, ba ảnh xếp chồng bên phải |
| `4-top-large` | 4 | Lớn ở trên, ba cột ở dưới |
| `4-bottom-large` | 4 | Ba cột ở trên, lớn ở dưới |
| `5-top2-bottom3` | 5 | Hai ở trên, ba ở dưới |
| `5-top3-bottom2` | 5 | Ba ở trên, hai ở dưới |
| `5-left-large` | 5 | Lớn bên trái, bốn ảnh xếp chồng bên phải |
| `5-center-large` | 5 | Lớn ở giữa, bốn góc |
| `6-grid-2x3` | 6 | 2 cột x 3 hàng |
| `6-grid-3x2` | 6 | 3 cột x 2 hàng |
| `6-top-large` | 6 | Lớn ở trên, năm cột ở dưới |
| `7-mosaic` | 7 | Bố cục khảm |
| `8-mosaic` | 8 | Bố cục khảm |
| `9-grid` | 9 | Lưới 3x3 |

## Ví dụ yêu cầu {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Ghi chú {#notes}

- Tải lên nhiều tệp ảnh trong yêu cầu multipart. Các ảnh được gán vào ô mẫu theo thứ tự tải lên.
- Nếu tải lên nhiều ảnh hơn mức mẫu hỗ trợ, các ảnh dư sẽ bị bỏ qua.
- Hỗ trợ định dạng đầu vào HEIC, RAW, PSD và SVG (được giải mã tự động).
- Kích thước gốc của canvas là 2400px ở cạnh dài nhất, được co giãn theo tỷ lệ khung hình đã chọn.
- Khi `aspectRatio` là `"free"`, canvas mặc định là 4:3 (2400x1800).
- Giá trị `panX`/`panY` theo từng ô dịch chuyển khung cắt bên trong ô. Giá trị 100 dịch hoàn toàn về một cạnh, -100 về cạnh kia.
- Màu nền `"transparent"` chỉ được giữ lại với định dạng đầu ra `png`, `webp` hoặc `avif`.
