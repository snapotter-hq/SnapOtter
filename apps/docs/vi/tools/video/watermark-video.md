---
description: "Kết xuất watermark văn bản lên các khung hình video."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: cea9f9ac47b7
---

# Watermark Video {#watermark-video}

Kết xuất watermark văn bản lên mọi khung hình của video với vị trí, kích thước, độ mờ và màu sắc có thể cấu hình.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Nhận multipart form data gồm một file video và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | Văn bản watermark (1-200 ký tự) |
| position | string | No | `"br"` | Vị trí trên khung hình: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | Cỡ chữ tính bằng pixel (8-120) |
| opacity | number | No | `0.5` | Độ mờ watermark (0.05-1) |
| color | string | No | `"#ffffff"` | Màu hex cho văn bản (ví dụ `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Trên bên trái, **tc** - Trên giữa, **tr** - Trên bên phải
- **l** - Giữa bên trái, **c** - Chính giữa, **r** - Giữa bên phải
- **bl** - Dưới bên trái, **bc** - Dưới giữa, **br** - Dưới bên phải

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- Watermark được kết xuất vĩnh viễn vào các khung hình video và không thể xóa sau khi xử lý.
- Watermark dùng font sans-serif tích hợp sẵn trong FFmpeg.
- Để có watermark bằng ảnh, hãy dùng công cụ Watermark của hình ảnh.
