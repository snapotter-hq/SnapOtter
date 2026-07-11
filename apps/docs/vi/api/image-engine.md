---
description: "Tài liệu tham khảo các thao tác của engine hình ảnh. Tất cả thao tác xử lý ảnh dựa trên Sharp và tham số của chúng."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 41a2d7276a22
---

# Engine hình ảnh {#image-engine}

Gói `@snapotter/image-engine` xử lý mọi thao tác ảnh không dùng AI. Nó bao bọc [Sharp](https://sharp.pixelplumbing.com/) và chạy hoàn toàn trong tiến trình mà không có phụ thuộc bên ngoài.

## Thao tác {#operations}

### resize {#resize}

Thay đổi tỷ lệ ảnh theo kích thước cụ thể hoặc theo phần trăm.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `width` | number | Chiều rộng mục tiêu tính bằng điểm ảnh |
| `height` | number | Chiều cao mục tiêu tính bằng điểm ảnh |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, hoặc `outside` |
| `withoutEnlargement` | boolean | Nếu true, sẽ không phóng to các ảnh nhỏ hơn |
| `percentage` | number | Thay đổi tỷ lệ theo phần trăm thay vì kích thước tuyệt đối |

Bạn có thể đặt `width`, `height`, hoặc cả hai. Nếu chỉ đặt một, giá trị còn lại được tính để giữ tỷ lệ khung hình.

### crop {#crop}

Cắt một vùng hình chữ nhật ra khỏi ảnh.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `left` | number | Độ lệch X từ cạnh trái |
| `top` | number | Độ lệch Y từ cạnh trên |
| `width` | number | Chiều rộng của vùng cắt |
| `height` | number | Chiều cao của vùng cắt |
| `unit` | string | `px` (mặc định) hoặc `percent` |

### rotate {#rotate}

Xoay ảnh theo một góc cho trước.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `angle` | number | Góc xoay tính bằng độ (0-360) |
| `background` | string | Màu tô cho vùng lộ ra (mặc định: `#000000`). Chỉ áp dụng cho các góc không phải 90 độ. |

### flip {#flip}

Lật ảnh theo chiều ngang, chiều dọc, hoặc cả hai. Ít nhất một phải là true.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `horizontal` | boolean | Lật từ trái sang phải |
| `vertical` | boolean | Lật từ trên xuống dưới |

### convert {#convert}

Thay đổi định dạng ảnh.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `format` | string | Định dạng mục tiêu: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Chất lượng nén (1-100, áp dụng cho các định dạng có tổn hao) |

Bảy định dạng đầu tiên (từ `jpg` đến `jxl`) được Sharp mã hóa trong tiến trình. Các định dạng còn lại dùng bộ mã hóa bên ngoài ở lớp API: `heic`/`heif` qua heif-enc, `bmp`/`ico` qua ImageMagick, `jp2` qua opj_compress, và `qoi` qua một codec TypeScript nội tuyến.

### compress {#compress}

Giảm kích thước tệp trong khi giữ nguyên định dạng.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `quality` | number | Chất lượng mục tiêu (1-100) |
| `targetSizeBytes` | number | Kích thước tệp mục tiêu tùy chọn tính bằng byte |
| `format` | string | Ghi đè định dạng tùy chọn |

### strip-metadata {#strip-metadata}

Xóa siêu dữ liệu EXIF, IPTC, XMP, và ICC khỏi ảnh. Khi không có tham số nào (hoặc `stripAll: true`), xóa tất cả. Truyền các cờ riêng lẻ để xóa có chọn lọc.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `stripAll` | boolean | Xóa toàn bộ siêu dữ liệu (mặc định khi không đặt cờ nào) |
| `stripExif` | boolean | Xóa dữ liệu EXIF (bao gồm GPS nếu `stripGps` không được đặt riêng) |
| `stripGps` | boolean | Xóa dữ liệu vị trí GPS |
| `stripIcc` | boolean | Xóa hồ sơ màu ICC |
| `stripXmp` | boolean | Xóa siêu dữ liệu XMP |

### Điều chỉnh màu {#color-adjustments}

Các thao tác này chỉnh sửa thuộc tính màu của ảnh. Mỗi thao tác nhận một giá trị số duy nhất.

| Thao tác | Tham số | Khoảng | Mô tả |
|---|---|---|---|
| `brightness` | `value` | -100 đến 100 | Điều chỉnh độ sáng |
| `contrast` | `value` | -100 đến 100 | Điều chỉnh độ tương phản |
| `saturation` | `value` | -100 đến 100 | Điều chỉnh độ bão hòa màu |

### Bộ lọc màu {#color-filters}

Các bộ lọc này áp dụng một biến đổi màu cố định. Chúng không nhận tham số.

| Thao tác | Mô tả |
|---|---|
| `grayscale` | Chuyển sang thang xám |
| `sepia` | Áp dụng tông màu sepia |
| `invert` | Đảo ngược toàn bộ màu |

### Kênh màu {#color-channels}

Điều chỉnh từng kênh màu RGB riêng lẻ. Giá trị là hệ số nhân trong đó 100 = không thay đổi.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `red` | number | Hệ số nhân kênh đỏ (0 đến 200, 100 = không đổi) |
| `green` | number | Hệ số nhân kênh xanh lá (0 đến 200, 100 = không đổi) |
| `blue` | number | Hệ số nhân kênh xanh dương (0 đến 200, 100 = không đổi) |

### sharpen {#sharpen}

Làm sắc nét đơn giản được điều khiển bởi một giá trị duy nhất.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `value` | number | Cường độ làm sắc nét (0 đến 100). Được ánh xạ sang sigma Gaussian từ 0.5-10. |

### sharpen-advanced {#sharpen-advanced}

Làm sắc nét nâng cao với ba phương pháp có thể chọn và một bước tiền xử lý giảm nhiễu tùy chọn.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, hoặc `high-pass` |
| `sigma` | number | Bán kính làm mờ Gaussian, 0.5-10 (thích ứng) |
| `m1` | number | Làm sắc nét vùng phẳng, 0-10 (thích ứng) |
| `m2` | number | Làm sắc nét vùng có kết cấu, 0-20 (thích ứng) |
| `x1` | number | Ngưỡng phẳng/gồ ghề, 0-10 (thích ứng) |
| `y2` | number | Làm sáng tối đa (kẹp quầng sáng), 0-50 (thích ứng) |
| `y3` | number | Làm tối tối đa (kẹp quầng sáng), 0-50 (thích ứng) |
| `amount` | number | Phần trăm cường độ, 0-500 (unsharp-mask) |
| `radius` | number | Bán kính làm mờ, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | Độ sáng cạnh tối thiểu, 0-255 (unsharp-mask) |
| `strength` | number | Cường độ hòa trộn, 0-100 (high-pass) |
| `kernelSize` | number | `3` hoặc `5` cho kernel 3x3 / 5x5 (high-pass) |
| `denoise` | string | Bước tiền xử lý giảm nhiễu: `off`, `light`, `medium`, hoặc `strong` |

Các tham số là riêng theo phương pháp. Chỉ cung cấp những tham số liên quan đến phương pháp đã chọn.

### color-blindness {#color-blindness}

Mô phỏng khiếm khuyết thị giác màu bằng ma trận tái kết hợp màu 3x3.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `type` | string | Một trong: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Ghi hoặc xóa từng trường siêu dữ liệu EXIF/IPTC riêng lẻ mà không xóa toàn bộ khối.

| Tham số | Kiểu | Mô tả |
|---|---|---|
| `artist` | string | Thẻ EXIF Artist |
| `copyright` | string | Thẻ EXIF Copyright |
| `imageDescription` | string | Thẻ EXIF ImageDescription |
| `software` | string | Thẻ EXIF Software |
| `dateTime` | string | Thẻ EXIF DateTime |
| `dateTimeOriginal` | string | Thẻ EXIF DateTimeOriginal |
| `clearGps` | boolean | Xóa tất cả thẻ GPS |
| `fieldsToRemove` | string[] | Danh sách tên trường EXIF cần xóa |

Tất cả tham số đều tùy chọn. Các trường được liệt kê trong `fieldsToRemove` bị xóa khỏi khối EXIF hiện có. Các trường được đặt qua tham số có tên sẽ được ghi (hoặc ghi đè). Các khóa nhị phân/không an toàn như MakerNote bị bỏ qua một cách âm thầm.

## Phát hiện định dạng {#format-detection}

Engine tự động phát hiện định dạng đầu vào từ phần đầu tệp, không chỉ từ phần mở rộng tệp. Điều này có nghĩa là một tệp `.jpg` thực chất là PNG sẽ được xử lý đúng cách. Việc phát hiện dùng cách tiếp cận nhiều lớp: các byte magic trước, rồi phần mở rộng tệp làm dự phòng.

SnapOtter hỗ trợ **hơn 55 định dạng đầu vào** và **13 định dạng đầu ra**, bao gồm 23 định dạng camera RAW từ hơn 20 hãng, các định dạng chuyên nghiệp (PSD, EPS, OpenEXR, HDR), các codec hiện đại (JPEG XL, AVIF, HEIC, QOI, JPEG 2000), và các định dạng khoa học/trò chơi (FITS, DDS). Việc giải mã được Sharp xử lý nguyên bản khi có thể, với dự phòng tự động sang ImageMagick, LibRaw, và các bộ giải mã CLI chuyên dụng.

Xem trang [Định dạng được hỗ trợ](/vi/guide/supported-formats) để có danh sách đầy đủ.

## Trích xuất siêu dữ liệu {#metadata-extraction}

Công cụ `info` trả về siêu dữ liệu ảnh. Xem [Thông tin ảnh](/vi/tools/image/info) để có tài liệu tham khảo đầy đủ về các trường.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
