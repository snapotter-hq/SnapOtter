---
description: "Thay đổi kích thước ảnh theo pixel, phần trăm hoặc với các chế độ vừa khít."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: bcce4cd579a4
---

# Thay đổi kích thước ảnh {#resize}

Thay đổi kích thước ảnh bằng cách chỉ định kích thước pixel chính xác, hệ số tỷ lệ phần trăm, hoặc một chế độ vừa khít kiểm soát cách ảnh thích ứng với kích thước đích.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

Chấp nhận multipart form data với một tệp ảnh và một trường JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Chiều rộng đích tính bằng pixel (tối đa 16383) |
| height | integer | No | - | Chiều cao đích tính bằng pixel (tối đa 16383) |
| fit | string | No | `"contain"` | Cách ảnh vừa với kích thước: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | Ngăn phóng to nếu ảnh nhỏ hơn đích |
| percentage | number | No | - | Tỷ lệ theo phần trăm (ví dụ 50 để bằng nửa kích thước) |

Phải cung cấp ít nhất một trong `width`, `height`, hoặc `percentage`.

### Fit Modes {#fit-modes}

- **contain** - Thay đổi kích thước để vừa trong phạm vi kích thước, giữ tỷ lệ khung hình (có thể để lại khoảng trống)
- **cover** - Thay đổi kích thước để phủ kín kích thước, giữ tỷ lệ khung hình (có thể cắt)
- **fill** - Kéo giãn để khớp chính xác kích thước (bỏ qua tỷ lệ khung hình)
- **inside** - Giống `contain`, nhưng chỉ thu nhỏ, không bao giờ phóng to
- **outside** - Giống `cover`, nhưng chỉ thu nhỏ, không bao giờ phóng to

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Thay đổi kích thước theo phần trăm:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- Kích thước tối đa là 16383 pixel trên mỗi trục (giới hạn Sharp/libvips).
- Định dạng đầu ra khớp với định dạng đầu vào. Các đầu vào HEIC, RAW, PSD và SVG được tự động giải mã trước khi xử lý.
- Hướng EXIF được tự động áp dụng trước khi thay đổi kích thước.
- Cờ `withoutEnlargement` hữu ích cho xử lý hàng loạt khi một số ảnh có thể đã nhỏ hơn đích.
