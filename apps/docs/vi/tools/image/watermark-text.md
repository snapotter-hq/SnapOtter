---
description: "Thêm watermark văn bản với vị trí, độ mờ đục, xoay, và lặp lát có thể cấu hình."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 0667e16cd73a
---

# Watermark văn bản {#text-watermark}

Thêm lớp phủ watermark văn bản vào ảnh. Hỗ trợ đặt đơn ở góc/giữa hoặc lặp lát trên toàn bộ ảnh, với cỡ chữ, màu sắc, độ mờ đục, và xoay có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| text | string | Có | - | Văn bản watermark (1 đến 500 ký tự) |
| fontSize | number | Không | `48` | Cỡ chữ tính bằng pixel (8 đến 1000) |
| color | string | Không | `"#000000"` | Màu chữ dạng hex (`#RRGGBB`) |
| opacity | number | Không | `50` | Phần trăm độ mờ đục văn bản (0 đến 100) |
| position | string | Không | `"center"` | Vị trí: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Không | `0` | Góc xoay văn bản tính bằng độ (-360 đến 360) |

## Ví dụ Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Watermark lặp lát trên toàn bộ ảnh:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Ví dụ Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Ghi chú {#notes}

- Watermark được kết xuất dưới dạng văn bản SVG và composite lên ảnh, giữ nguyên chất lượng đầu ra.
- Chế độ lặp lát dãn cách các phần tử văn bản dựa trên cỡ chữ (khoảng cách ngang 6x, dọc 4x), giới hạn tối đa 500 phần tử.
- Đối với vị trí góc, khoảng đệm từ cạnh bằng cỡ chữ.
- Font được dùng là font sans-serif mặc định của hệ thống.
- Các ký tự đặc biệt XML trong văn bản (`&`, `<`, `>`, `"`, `'`) được escape an toàn.
- Định dạng đầu ra khớp với định dạng đầu vào. Đầu vào HEIC, RAW, PSD, và SVG được tự động giải mã trước khi xử lý.
