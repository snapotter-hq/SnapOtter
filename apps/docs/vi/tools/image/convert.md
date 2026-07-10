---
description: "Chuyển đổi ảnh giữa các định dạng bao gồm các định dạng hiện đại như AVIF, JXL và HEIC."
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: b90c7763aa36
---

# Chuyển đổi {#convert}

Chuyển đổi ảnh giữa các định dạng. Hỗ trợ các định dạng web phổ biến cũng như các định dạng chuyên biệt như HEIC, JXL, BMP, ICO, JP2, QOI và PSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

Chấp nhận dữ liệu form multipart với một tệp ảnh và một trường JSON `settings`.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| format | string | Có | - | Định dạng mục tiêu: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Không | - | Chất lượng đầu ra (1-100). Áp dụng cho các định dạng có mất dữ liệu như jpg, webp, avif, heic. |

## Các định dạng đầu ra được hỗ trợ {#supported-output-formats}

| Định dạng | Kiểu | Ghi chú |
|--------|------|-------|
| jpg | Mất dữ liệu | JPEG, tương thích tốt nhất |
| png | Không mất dữ liệu | Hỗ trợ trong suốt |
| webp | Cả hai | Định dạng web hiện đại, nén tốt |
| avif | Mất dữ liệu | Định dạng thế hệ mới, nén xuất sắc |
| tiff | Cả hai | Quy trình in ấn/xuất bản |
| gif | Không mất dữ liệu | Giới hạn 256 màu |
| heic / heif | Mất dữ liệu | Định dạng hệ sinh thái Apple |
| jxl | Cả hai | JPEG XL, định dạng thế hệ mới |
| bmp | Không mất dữ liệu | Bitmap không nén |
| ico | Không mất dữ liệu | Định dạng biểu tượng Windows |
| jp2 | Mất dữ liệu | JPEG 2000 |
| qoi | Không mất dữ liệu | Định dạng Quite OK Image |
| psd | Có lớp | Adobe Photoshop (cần ImageMagick) |
| ppm | Không mất dữ liệu | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Không mất dữ liệu | Định dạng ảnh Targa |

## Ví dụ yêu cầu {#example-request}

Chuyển đổi sang WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Chuyển đổi sang PNG (không mất dữ liệu):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Ví dụ phản hồi {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Ghi chú {#notes}

- Phần mở rộng tên tệp đầu ra được tự động cập nhật để khớp với định dạng mục tiêu.
- Đầu vào SVG được rasterize ở 300 DPI trước khi chuyển đổi.
- Chuyển đổi PSD cần cài đặt ImageMagick trên máy chủ.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI và TGA dùng các bộ mã hóa CLI chuyên biệt và bỏ qua xử lý Sharp.
- Mã hóa HEIC/HEIF sử dụng thư viện mã hóa HEIC của hệ thống.
- Các định dạng đầu vào rất rộng: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, v.v.), PSD, SVG, BMP và nhiều hơn nữa.
