---
description: "Tạo tất cả các kích thước favicon và icon ứng dụng tiêu chuẩn từ một ảnh nguồn."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 594a09ad4c8b
---

# Trình tạo Favicon {#favicon-generator}

Tạo một bộ đầy đủ các tệp favicon và icon ứng dụng từ một ảnh nguồn. Tạo ra tất cả các kích thước tiêu chuẩn cần thiết cho trình duyệt, thiết bị Apple và Android, cùng với một web manifest và một đoạn HTML.

## Điểm cuối API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Chấp nhận dữ liệu biểu mẫu multipart với một hoặc nhiều tệp ảnh và một trường JSON `settings` tùy chọn.

## Tham số {#parameters}

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|-----------|------|----------|---------|-------------|
| background | string | Không | - | Màu nền dạng hex (ví dụ `"#ffffff"`). Khi được đặt, icon sẽ được làm phẳng lên màu này. |
| padding | integer | Không | `0` | Phần trăm khoảng đệm quanh nội dung icon (0 đến 40) |
| radius | integer | Không | `0` | Phần trăm bán kính bo góc cho icon bo tròn (0 đến 50) |
| sizes | integer[] | Không | - | Giới hạn đầu ra ở các kích thước pixel cụ thể (ví dụ `[16, 32, 180]`). Bỏ qua để tạo tất cả các kích thước tiêu chuẩn. |
| themeColor | string | Không | `"#ffffff"` | Màu chủ đề dạng hex cho web manifest |

## Các tệp được tạo {#generated-files}

Với mỗi ảnh đầu vào, các tệp sau được tạo ra:

| Tệp | Kích thước | Mục đích |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Icon tab trình duyệt |
| `favicon-32x32.png` | 32x32 | Icon tab trình duyệt (HiDPI) |
| `favicon-48x48.png` | 48x48 | Lối tắt trên màn hình nền |
| `apple-touch-icon.png` | 180x180 | Màn hình chính iOS |
| `android-chrome-192x192.png` | 192x192 | Màn hình chính Android |
| `android-chrome-512x512.png` | 512x512 | Màn hình chờ Android |
| `favicon.ico` | 32x32 | Định dạng ICO cũ |
| `manifest.json` | - | Web app manifest có tham chiếu icon |
| `favicon-snippet.html` | - | Các thẻ link HTML sẵn sàng dùng |

## Ví dụ yêu cầu {#example-request}

Một ảnh nguồn đơn với góc bo tròn và khoảng đệm:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Nhiều ảnh nguồn (mỗi ảnh có bộ riêng trong một thư mục con):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Ví dụ phản hồi {#example-response}

Phản hồi là một tệp ZIP được truyền trực tiếp. Các header của phản hồi là:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Đoạn HTML đi kèm {#html-snippet-included}

Tệp ZIP bao gồm một tệp `favicon-snippet.html` mà bạn có thể dán vào `<head>` HTML của mình:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Ghi chú {#notes}

- Ảnh nguồn được thay đổi kích thước bằng chế độ fit `cover`, nghĩa là chúng bị cắt để lấp đầy mỗi kích thước vuông. Để có kết quả tốt nhất, hãy dùng ảnh nguồn hình vuông.
- Khi nhiều tệp được tải lên, mỗi tệp có thư mục con riêng trong ZIP (đặt tên theo tệp nguồn).
- Với việc tải lên một tệp đơn, tất cả đầu ra nằm ở gốc của ZIP mà không có thư mục con.
- Các tệp không vượt qua bước xác thực hoặc giải mã sẽ bị bỏ qua, và một `skipped-files.txt` được thêm vào ZIP để giải thích các vấn đề.
- Các định dạng đầu vào được hỗ trợ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD và nhiều định dạng khác.
- Hướng EXIF được áp dụng tự động trước khi thay đổi kích thước.
