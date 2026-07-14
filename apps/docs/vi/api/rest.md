---
description: "Tài liệu tham khảo REST API đầy đủ. Endpoint công cụ, xử lý hàng loạt, pipeline, thư viện tệp, xác thực, nhóm và các thao tác quản trị."
i18n_output_hash: a2d3795ef769
i18n_source_hash: b89b5df16af5
i18n_provenance: human
---

# Tài liệu tham khảo REST API {#rest-api-reference}

Tài liệu API tương tác kèm ví dụ request/response có sẵn tại [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Đặc tả có thể đọc bằng máy:
- `/api/v1/openapi.yaml` - đặc tả OpenAPI 3.1
- `/llms.txt` - bản tóm tắt thân thiện với LLM
- `/llms-full.txt` - tài liệu đầy đủ thân thiện với LLM

## Xác thực {#authentication}

Mọi endpoint đều yêu cầu xác thực trừ khi `AUTH_ENABLED=false`.

### Token phiên {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Phiên hết hạn sau 7 ngày (có thể cấu hình qua `SESSION_DURATION_HOURS`).

### Khóa API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Khóa có tiền tố `si_` và được lưu dưới dạng hash scrypt - khóa thô chỉ hiển thị một lần và không bao giờ lấy lại được nữa.

### Endpoint xác thực {#auth-endpoints}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Công khai | Đăng nhập, lấy token phiên |
| `POST` | `/api/auth/logout` | Xác thực | Hủy phiên hiện tại |
| `GET` | `/api/auth/session` | Xác thực | Xác thực phiên hiện tại |
| `POST` | `/api/auth/change-password` | Xác thực | Đổi mật khẩu của chính mình (vô hiệu hóa mọi phiên khác + khóa API) |
| `GET` | `/api/auth/users` | Admin | Liệt kê tất cả người dùng |
| `POST` | `/api/auth/register` | Admin | Tạo người dùng mới |
| `PUT` | `/api/auth/users/:id` | Admin | Cập nhật vai trò hoặc nhóm của người dùng |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Đặt lại mật khẩu của người dùng |
| `DELETE` | `/api/auth/users/:id` | Admin | Xóa một người dùng |
| `GET` | `/api/v1/config/auth` | Công khai | Kiểm tra xác thực có được bật hay không (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Xác thực | Bắt đầu đăng ký TOTP MFA. Yêu cầu tính năng enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Xác thực | Xác nhận đăng ký MFA bằng mã TOTP |
| `POST` | `/api/auth/mfa/complete` | Công khai | Hoàn tất thử thách đăng nhập MFA đang chờ |
| `POST` | `/api/auth/mfa/disable` | Xác thực | Tắt MFA cho người dùng hiện tại |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Đặt lại MFA cho một người dùng |
| `GET` | `/api/auth/oidc/login` | Công khai | Bắt đầu đăng nhập OIDC khi OIDC được bật |
| `GET` | `/api/auth/oidc/callback` | Công khai | Callback ủy quyền OIDC |
| `GET` | `/api/auth/saml/metadata` | Công khai | XML metadata SAML SP khi SAML được bật |
| `GET` | `/api/auth/saml/login` | Công khai | Bắt đầu đăng nhập SAML |
| `POST` | `/api/auth/saml/callback` | Công khai | Dịch vụ tiêu thụ khẳng định SAML |

Khi MFA được bật cho một người dùng, `POST /api/auth/login` trả về `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` thay vì token phiên. Gửi `mfaToken` đó cùng mã TOTP hoặc mã khôi phục tới `/api/auth/mfa/complete`.

### Quyền hạn {#permissions}

| Quyền hạn | Admin | User |
|-----------|:-----:|:----:|
| Dùng công cụ | ✓ | ✓ |
| Tệp/pipeline/khóa API của riêng mình | ✓ | ✓ |
| Xem tệp/pipeline/khóa của mọi người dùng | ✓ | - |
| Ghi cài đặt | ✓ | - |
| Quản lý người dùng & nhóm | ✓ | - |
| Quản lý thương hiệu | ✓ | - |

## Kiểm tra tình trạng {#health-check}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Công khai | Kiểm tra tình trạng cơ bản. Trả về `{"status":"healthy","version":"..."}` với 200, hoặc `{"status":"unhealthy"}` với 503 nếu không kết nối được cơ sở dữ liệu. |
| `GET` | `/api/v1/readyz` | Công khai | Kiểm tra sẵn sàng. Kiểm tra PostgreSQL, Redis, dung lượng đĩa và S3 khi được cấu hình. Trả về 503 khi instance không nên nhận lưu lượng. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Chẩn đoán chi tiết bao gồm thời gian hoạt động, chế độ lưu trữ, trạng thái cơ sở dữ liệu, trạng thái hàng đợi và khả năng dùng GPU. |

## Sử dụng công cụ {#using-tools}

Mọi công cụ đều theo cùng một mẫu:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` là một trong `image`, `video`, `audio`, `pdf`, hoặc `files`.

- Tải lên là `multipart/form-data`.
- `settings` là một chuỗi JSON chứa các tùy chọn riêng của công cụ.
- `clientJobId` là một trường form tùy chọn để đối chiếu tiến trình do bên gọi cung cấp.
- `fileId` là một trường form tùy chọn tham chiếu đến một mục có sẵn trong thư viện tệp. Khi có mặt, đầu ra đã xử lý được lưu thành phiên bản mới và response bao gồm `savedFileId`.
- **Công cụ nhanh** thường trả về 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Tải tệp đã xử lý từ `downloadUrl`.
- **Bất kỳ công cụ nào được xếp hàng** có thể trả về 202 JSON nếu chạy lâu hoặc vượt quá khung chờ đồng bộ: `{"jobId":"...","async":true}`. Kết nối SSE để theo dõi tiến trình, rồi tải xuống khi hoàn tất (xem [Theo dõi tiến trình](#progress-tracking)).
- **Route hàng loạt** trả về một kho lưu trữ ZIP được stream trực tiếp (kèm header `X-Job-Id`) cho các công cụ được đăng ký trong registry hàng loạt tổng quát.

## Tham khảo công cụ {#tools-reference}

### Cấu hình chuyển đổi sẵn {#conversion-presets}

Danh mục dùng chung bao gồm 83 endpoint cấu hình chuyển đổi chuyên biệt như `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, và `excel-to-csv`. Cấu hình sẵn là các route công cụ hạng nhất:

`POST /api/v1/tools/<section>/<presetId>`

Mỗi cấu hình sẵn khóa định dạng đầu ra và ủy thác cho một công cụ nền tảng như `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, hoặc `convert-spreadsheet`. Xem [Cấu hình chuyển đổi sẵn](/vi/tools/conversion-presets) để biết bảng route đầy đủ và các cài đặt tùy chọn.

### Cơ bản {#essentials}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `resize` | Đổi kích thước | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, cùng 23 cấu hình mạng xã hội sẵn |
| `crop` | Cắt | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Xoay & Lật | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Chuyển đổi | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Nén | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Tối ưu hóa {#optimization}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `optimize-for-web` | Tối ưu cho Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Xóa Metadata | - |
| `edit-metadata` | Sửa Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Đổi tên hàng loạt | `pattern` (hỗ trợ `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Ảnh sang PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Trình tạo Favicon | `padding`, `backgroundColor`, `borderRadius` - tạo mọi kích thước tiêu chuẩn |

### Điều chỉnh {#adjustments}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `adjust-colors` | Điều chỉnh màu | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Làm sắc nét | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Thay màu | `sourceColor`, `targetColor` (thay thế), `makeTransparent`, `tolerance` |
| `color-blindness` | Mô phỏng mù màu | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, mặc định "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Làm mờ pixel | `blockSize` (2-128), `region` ({left, top, width, height} để làm mờ pixel một phần) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Công cụ AI {#ai-tools}

Mọi công cụ AI đều chạy trên phần cứng của bạn: mặc định là CPU, hoặc NVIDIA CUDA khi có GPU NVIDIA được hỗ trợ. Tăng tốc iGPU của Intel/AMD qua VA-API, Quick Sync hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI. Không cần internet.

| ID công cụ | Tên | Mô hình AI | Cài đặt chính |
|---------|------|---------|-------------|
| `remove-background` | Xóa nền | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Phóng to ảnh | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Xóa vật thể | LaMa (ONNX) | Mặt nạ được gửi làm phần tệp thứ hai (tên trường `mask`), `format`, `quality` |
| `ocr` | OCR / Trích xuất văn bản | Tesseract (nhanh); RapidOCR + PP-OCR ONNX (cân bằng/tốt nhất) | `quality` (nhanh/cân bằng/tốt nhất), `language`, `enhance` |
| `blur-faces` | Làm mờ khuôn mặt / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Cắt thông minh | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Nâng cao ảnh | Dựa trên phân tích | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Nâng cao khuôn mặt | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Tô màu bằng AI | DDColor | `intensity`, `model` |
| `noise-removal` | Khử nhiễu | Khử nhiễu phân tầng | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Xóa mắt đỏ | Điểm mốc khuôn mặt + phân tích màu | `sensitivity`, `strength` |
| `restore-photo` | Phục hồi ảnh | Pipeline nhiều bước | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Ảnh hộ chiếu | Điểm mốc MediaPipe | Luồng hai giai đoạn. Phân tích dùng multipart `file`; tạo dùng JSON với `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), điểm mốc, kích thước ảnh |
| `content-aware-resize` | Đổi kích thước nhận biết nội dung | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Sửa độ trong suốt PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Thay nền | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Làm mờ nền | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Mở rộng khung vẽ bằng AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Đóng dấu & Lớp phủ {#watermark-overlay}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `watermark-text` | Dấu chìm văn bản | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Dấu chìm hình ảnh | `opacity`, `position`, `scale` - tệp thứ hai là dấu chìm |
| `text-overlay` | Lớp phủ văn bản | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Ghép ảnh | `x`, `y`, `opacity`, `blend` - tệp thứ hai được xếp lớp lên trên |
| `meme-generator` | Trình tạo Meme | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Hỗ trợ chế độ mẫu (thân JSON với `templateId`) hoặc chế độ ảnh tùy chỉnh (multipart kèm tệp). |

### Tiện ích {#utilities}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `info` | Thông tin ảnh | - (trả về width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | So sánh ảnh | `mode` (side-by-side/overlay/diff), `diffThreshold` - tệp thứ hai là đối tượng so sánh |
| `find-duplicates` | Tìm ảnh trùng | `threshold` (khoảng cách hash tri giác, mặc định 8) - đa tệp |
| `color-palette` | Bảng màu | `count` (số lượng màu chủ đạo), `format` (hex/rgb) |
| `qr-generate` | Trình tạo mã QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (tệp tùy chọn) |
| `barcode-read` | Đọc mã vạch | - (tự động phát hiện QR, EAN, Code128, DataMatrix, v.v.) |
| `image-to-base64` | Ảnh sang Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML sang ảnh | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Biểu đồ tần suất | `scale` (linear/log) - trả về biểu đồ histogram RGB + thống kê từng kênh |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Trình tạo mã vạch | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Thân JSON, không tải tệp lên. |

### Bố cục & Sắp xếp {#layout-composition}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `collage` | Ghép ảnh / Lưới | `template` (25+ bố cục), `gap`, `backgroundColor`, `borderRadius` - đa tệp |
| `stitch` | Ghép nối / Kết hợp | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - đa tệp |
| `split` | Chia ảnh | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Viền & Khung | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Làm đẹp ảnh chụp màn hình | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Cắt tròn | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Đệm ảnh | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - đa tệp (2-64 ảnh) |

### Định dạng & Chuyển đổi {#format-conversion}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `svg-to-raster` | SVG sang Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Ảnh sang SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Công cụ GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), tham số theo từng hành động |
| `gif-webp` | Trình chuyển đổi GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Công cụ Video {#video-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `convert-video` | Chuyển đổi Video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Nén Video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Cắt Video | `startS`, `endS`, `precise` (bool, cắt chính xác từng khung hình) |
| `mute-video` | Tắt tiếng Video | - |
| `video-to-gif` | Video sang GIF | `fps` (1-30), `width`, `startS`, `durationS` (tối đa 60 giây) |
| `resize-video` | Đổi kích thước Video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Cắt xén Video | `width`, `height`, `x`, `y` |
| `rotate-video` | Xoay Video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Đổi FPS | `fps` (1-120) |
| `video-color` | Màu Video | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Tốc độ Video | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Đảo ngược Video | - (tối đa 5 phút) |
| `video-loudnorm` | Chuẩn hóa âm thanh | - (EBU R128) |
| `aspect-pad` | Đệm tỷ lệ khung hình | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Đệm mờ | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Đóng dấu Video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Ổn định Video | `smoothing` (5-60, theo khung hình) |
| `gif-to-video` | GIF sang Video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video sang WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video sang khung hình | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Ghép Video | - (đa tệp, chuẩn hóa theo độ phân giải của video đầu tiên) |
| `replace-audio` | Thay âm thanh | - (tệp video + âm thanh, hai tệp) |
| `burn-subtitles` | Gắn phụ đề cứng | `fontSize` (8-72) - tệp video + phụ đề |
| `embed-subtitles` | Nhúng phụ đề | `language` (mã ISO 639-2/B) - tệp video + phụ đề |
| `extract-subtitles` | Trích xuất phụ đề | - (xuất SRT) |
| `images-to-video` | Ảnh sang Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - đa tệp |
| `video-metadata` | Dọn Metadata Video | - |
| `auto-subtitles` | Phụ đề tự động (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Trích xuất âm thanh | `format` (mp3/wav/m4a/ogg) |

### Công cụ Âm thanh {#audio-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `convert-audio` | Chuyển đổi âm thanh | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Cắt âm thanh | `startS`, `endS` |
| `volume-adjust` | Điều chỉnh âm lượng | `gainDb` (-30 đến 30) |
| `normalize-audio` | Chuẩn hóa âm thanh | - (EBU R128, -16 LUFS) |
| `fade-audio` | Làm mờ dần âm thanh | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Đảo ngược âm thanh | - |
| `audio-speed` | Tốc độ âm thanh | `factor` (0.25-4) |
| `pitch-shift` | Dịch cao độ | `semitones` (-12 đến 12) |
| `audio-channels` | Kênh âm thanh | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Loại bỏ khoảng lặng | `thresholdDb` (-80 đến -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Giảm nhiễu | `strength` (light/medium/strong) |
| `merge-audio` | Ghép âm thanh | `format` (mp3/wav/flac/m4a) - đa tệp |
| `split-audio` | Chia âm thanh | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Trình tạo nhạc chuông | `startS`, `durationS` (1-30) |
| `waveform-image` | Ảnh dạng sóng | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadata âm thanh | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Chuyển giọng nói thành văn bản (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Công cụ Tài liệu {#document-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `merge-pdf` | Ghép PDF | - (đa tệp, tối đa 20 PDF) |
| `split-pdf` | Chia PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Nén PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Xoay PDF | `angle` (90/180/270), `range` (khoảng trang) |
| `extract-pages` | Trích xuất trang | `range` (cú pháp qpdf, ví dụ "1-5,8,10-z") |
| `remove-pages` | Xóa trang | `pages` (khoảng qpdf cần xóa) |
| `organize-pdf` | Sắp xếp PDF | `order` (thứ tự trang qpdf, ví dụ "3,1,2,5-z") |
| `protect-pdf` | Bảo vệ PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Mở khóa PDF | `password` |
| `repair-pdf` | Sửa chữa PDF | - |
| `linearize-pdf` | Tối ưu PDF cho Web | - (tuyến tính hóa để xem web nhanh) |
| `grayscale-pdf` | PDF thang xám | - |
| `pdfa-convert` | Chuyển đổi PDF/A | - (PDF/A-2 lưu trữ) |
| `crop-pdf` | Cắt PDF | `margin` (0-2000 điểm) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Booklet PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Đóng dấu PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Đánh số trang PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Làm phẳng PDF | - (nướng biểu mẫu và chú thích) |
| `redact-pdf` | Che thông tin PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Ký PDF | Route multipart tùy chỉnh với PDF `file`, tệp chữ ký `sig0`, `sig1`, và mảng JSON `placements` |
| `pdf-to-text` | PDF sang Text | - |
| `pdf-to-word` | PDF sang Word | - |
| `pdf-metadata` | Metadata PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Chuyển đổi tài liệu | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Chuyển đổi bản trình bày | `format` (pptx/odp) |
| `convert-spreadsheet` | Chuyển đổi bảng tính | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel sang PDF | - |
| `word-to-pdf` | Word sang PDF | - |
| `powerpoint-to-pdf` | PowerPoint sang PDF | - |
| `html-to-pdf` | HTML sang PDF | - (tài nguyên từ xa bị tắt) |
| `markdown-to-docx` | Markdown sang Word | - |
| `markdown-to-html` | Markdown sang HTML | - |
| `markdown-to-pdf` | Markdown sang PDF | - (tài nguyên từ xa bị tắt) |
| `epub-convert` | Chuyển đổi EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Chuyển đổi sang EPUB | - (nhận .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF sang ảnh | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF sang JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF sang PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF sang TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Công cụ Tệp {#file-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `chart-maker` | Trình tạo biểu đồ | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV sang Excel | `sheet` (số trang tính cho đầu vào XLSX) - hai chiều |
| `csv-json` | CSV sang JSON | `pretty` (bool) - hai chiều |
| `json-xml` | JSON sang XML | `pretty` (bool) - hai chiều |
| `split-csv` | Chia CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Ghép CSV | - (đa tệp, cột khớp nhau) |
| `yaml-json` | YAML / JSON | - (hai chiều) |
| `xml-to-csv` | XML sang CSV | - (tự động tìm các phần tử lặp) |
| `excel-to-csv` | Excel sang CSV | cấu hình chuyển đổi chuyên biệt được hỗ trợ bởi `convert-spreadsheet` |
| `create-zip` | Tạo ZIP | - (đa tệp, 2-50 tệp) |
| `extract-zip` | Giải nén ZIP | - (chống bom nén) |

### HTML sang ảnh {#html-to-image}

Chụp một trang web thành ảnh. Khác với các công cụ khác, endpoint này nhận `application/json` thay vì dữ liệu form multipart (không cần tải tệp lên).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `url` | string | (bắt buộc) | URL cần chụp (chỉ http/https) |
| `format` | string | `"png"` | Định dạng đầu ra: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Chất lượng 1-100 (chỉ JPG/WebP) |
| `fullPage` | boolean | `false` | Chụp toàn bộ trang cuộn được |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Chiều rộng viewport tùy chỉnh 320-3840 |
| `viewportHeight` | number | `720` | Chiều cao viewport tùy chỉnh 320-2160 |

**Ví dụ:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Response:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Route con của công cụ {#tool-sub-routes}

Một số công cụ cung cấp thêm endpoint ngoài `POST /api/v1/tools/<section>/<toolId>` tiêu chuẩn:

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Trả về ID công cụ phổ biến, quay lại danh sách mặc định được tuyển chọn khi dữ liệu sử dụng còn ít |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Áp dụng hiệu ứng nền (color/gradient/blur/shadow) mà không chạy lại AI. Dùng mặt nạ được cache từ lần xóa ban đầu. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Đọc metadata EXIF/IPTC/XMP có sẵn từ một ảnh |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Kiểm tra các trường metadata trước khi xóa |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Giai đoạn 1: Phát hiện khuôn mặt bằng AI + xóa nền. Trả về điểm mốc khuôn mặt và dữ liệu được cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Giai đoạn 2: Cắt, đổi kích thước và xếp ô bằng phân tích được cache. Không chạy lại AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Lấy metadata GIF (số khung hình, kích thước, thời lượng) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Lấy metadata PDF (số trang, kích thước) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Tạo bản xem trước của một trang PDF cụ thể |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Lấy metadata PDF cho cấu hình JPG chuyên biệt |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Tạo bản xem trước trang PDF cấu hình JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Lấy metadata PDF cho cấu hình PNG chuyên biệt |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Tạo bản xem trước trang PDF cấu hình PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Lấy metadata PDF cho cấu hình TIFF chuyên biệt |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Tạo bản xem trước trang PDF cấu hình TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Chuyển đổi hàng loạt nhiều SVG sang raster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Phân tích chất lượng ảnh và trả về đề xuất nâng cao |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Bản xem trước nhẹ để tinh chỉnh tham số trực tiếp. Trả về ảnh được tối ưu kèm header kích thước. |

## Xử lý hàng loạt {#batch-processing}

Áp dụng một công cụ hỗ trợ hàng loạt tổng quát cho nhiều tệp cùng lúc. Trả về một kho lưu trữ ZIP. Các route đa tệp hoặc nhiều bước tùy chỉnh, chẳng hạn ký PDF và các route cấu hình PDF-sang-ảnh, dùng hợp đồng endpoint riêng thay vì route `/batch` tổng quát.

Công cụ `ocr-pdf` hỗ trợ route `/batch` tổng quát này.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Độ đồng thời được kiểm soát bởi `CONCURRENT_JOBS` (mặc định: tự động phát hiện từ số lõi CPU). `MAX_BATCH_SIZE` giới hạn số tệp mỗi lô (mặc định: 100; đặt 0 để không giới hạn).

## Pipeline {#pipelines}

### Thực thi một pipeline {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

Đầu ra của mỗi bước là đầu vào của bước tiếp theo. Pipeline mặc định cho phép 20 bước, có thể cấu hình qua `MAX_PIPELINE_STEPS`. Đặt `MAX_PIPELINE_STEPS=0` để bỏ giới hạn.

### Lưu và quản lý pipeline {#save-and-manage-pipelines}

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Lưu một pipeline có tên (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Liệt kê pipeline đã lưu (admin thấy tất cả; người dùng thấy của riêng mình) |
| `DELETE` | `/api/v1/pipeline/:id` | Xóa (chủ sở hữu hoặc admin) |
| `GET` | `/api/v1/pipeline/tools` | Liệt kê các ID công cụ hợp lệ cho các bước pipeline |

## Theo dõi tiến trình {#progress-tracking}

Các tác vụ chạy lâu, công cụ được xếp hàng, tác vụ hàng loạt và pipeline phát tiến trình theo thời gian thực qua Server-Sent Events. Luồng tiến trình là công khai và được khóa theo ID tác vụ, nên client không cần gửi header Authorization để đọc.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Định dạng sự kiện:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Bạn có thể yêu cầu hủy một tác vụ đang xếp hàng hoặc đang chạy bằng `POST /api/v1/jobs/:jobId/cancel`. Response là `{"canceled":true|false}`.

## Thư viện tệp {#file-library}

Lưu trữ tệp bền vững kèm lịch sử phiên bản.

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Tải tệp lên không gian làm việc (xử lý tạm thời) |
| `POST` | `/api/v1/files/upload` | Tải tệp lên thư viện tệp bền vững |
| `POST` | `/api/v1/files/save-result` | Lưu kết quả xử lý của công cụ thành phiên bản tệp mới |
| `GET` | `/api/v1/files` | Liệt kê tệp đã lưu (phân trang, có tìm kiếm) |
| `GET` | `/api/v1/files/:id` | Lấy metadata tệp + chuỗi phiên bản |
| `GET` | `/api/v1/files/:id/download` | Tải tệp xuống |
| `GET` | `/api/v1/files/:id/thumbnail` | Lấy hình thu nhỏ JPEG 300px |
| `DELETE` | `/api/v1/files` | Xóa hàng loạt tệp và chuỗi phiên bản của chúng (thân: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Tải URL từ xa vào không gian làm việc cho các lần nhập dựa trên URL |
| `POST` | `/api/v1/preview` | Tạo bản xem trước WebP tương thích trình duyệt (cho định dạng HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Stream bản xem trước tương thích trình duyệt được cache hoặc tạo mới cho một tệp PDF, tài liệu văn phòng, video hoặc âm thanh đã lưu |
| `POST` | `/api/v1/preview/generate` | Tạo bản xem trước MP4 hoặc MP3 theo yêu cầu cho một tệp phương tiện đã tải lên mà không cần lưu trước |
| `GET` | `/api/v1/download/:jobId/:filename` | Tải một tệp đã xử lý từ không gian làm việc |

Để tự động lưu kết quả công cụ vào thư viện, hãy đưa vào `fileId` làm một trường form multipart tham chiếu đến một tệp có sẵn trong thư viện. Kết quả đã xử lý sẽ được lưu thành phiên bản mới.

## Quản lý khóa API {#api-key-management}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Xác thực | Tạo khóa mới - chỉ hiển thị một lần |
| `GET` | `/api/v1/api-keys` | Xác thực | Liệt kê khóa (name, id, lastUsedAt - không phải khóa thô) |
| `DELETE` | `/api/v1/api-keys/:id` | Xác thực | Xóa khóa |

## Nhóm {#teams}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Liệt kê nhóm |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Tạo nhóm |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Đổi tên nhóm |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Xóa nhóm (không thể xóa nhóm mặc định hoặc nhóm có thành viên) |

## Cài đặt {#settings}

Cấu hình khóa-giá trị lúc chạy (bất kỳ người dùng đã xác thực nào cũng đọc được, chỉ admin ghi được).

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Lấy tất cả cài đặt |
| `PUT` | `/api/v1/settings` | Cập nhật hàng loạt cài đặt (thân JSON với các cặp khóa-giá trị) |
| `GET` | `/api/v1/settings/:key` | Lấy một cài đặt cụ thể theo khóa |

Các khóa đã biết: `disabledTools` (mảng JSON gồm các ID công cụ), `enableExperimentalTools` (chuỗi bool), `loginAttemptLimit` (số).

## Tùy chọn {#preferences}

Tùy chọn theo từng người dùng tách biệt với cài đặt instance. Bất kỳ người dùng đã xác thực nào cũng có thể đọc và cập nhật bản đồ tùy chọn của riêng mình.

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Lấy tùy chọn của người dùng hiện tại dưới dạng `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Chèn/cập nhật một hoặc nhiều khóa tùy chọn cho người dùng hiện tại |

## Vai trò {#roles}

Quản lý vai trò tùy chỉnh với quyền hạn chi tiết.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Liệt kê tất cả vai trò kèm số người dùng |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Tạo một vai trò tùy chỉnh (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Cập nhật một vai trò tùy chỉnh (không thể sửa vai trò tích hợp sẵn) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Xóa một vai trò tùy chỉnh (không thể xóa vai trò tích hợp sẵn; người dùng bị ảnh hưởng trở về vai trò `user`) |

Các quyền hạn có sẵn (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Nhật ký kiểm toán {#audit-log}

Endpoint chỉ dành cho admin để xem lại các hành động liên quan đến bảo mật.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Nhật ký kiểm toán phân trang với bộ lọc tùy chọn |

Các tham số truy vấn:

| Tham số | Mô tả |
|-----------|-------------|
| `page` | Số trang (mặc định: 1) |
| `limit` | Số mục mỗi trang (mặc định: 50, tối đa: 100) |
| `action` | Lọc theo loại hành động (ví dụ `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Lọc theo địa chỉ IP nguồn |
| `from` | Lọc các mục sau ngày ISO 8601 này |
| `to` | Lọc các mục trước ngày ISO 8601 này |

## Phân tích {#analytics}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Công khai | Lấy cấu hình phân tích có hiệu lực (khóa PostHog, Sentry DSN, tỷ lệ lấy mẫu). Khóa, DSN và ID instance để trống khi phân tích bị tắt, dù từ việc nướng lúc biên dịch hay từ cài đặt `analyticsEnabled` của instance. |
| `POST` | `/api/v1/feedback` | Xác thực | Gửi phản hồi rõ ràng của người dùng đến dự án PostHog đã cấu hình dưới dạng `feedback_submitted`. Route tuân thủ cổng phân tích, giới hạn tốc độ gửi, loại bỏ các trường liên hệ trừ khi `contactOk` là true, và không bao giờ nhận nội dung tệp, tên tệp, đường dẫn tải lên hoặc văn bản lỗi riêng tư thô. Khi phân tích bị tắt, nó trả về `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Đặt tùy chọn từ chối trên toàn instance. Gửi một thân JSON `{ "analyticsEnabled": "false" }` để tắt phân tích cho tất cả mọi người, hoặc `"true"` để bật lại. |

## Tính năng / Bundle AI {#features-ai-bundles}

Quản lý các bundle tính năng AI (cài đặt/gỡ cài đặt các gói mô hình AI trong môi trường Docker). Ưu tiên endpoint cài đặt ở cấp công cụ khi bật một công cụ từ tự động hóa tùy chỉnh: một số công cụ AI cần nhiều hơn một bundle dùng chung, và endpoint này bỏ qua các bundle đã cài đặt trong khi chỉ xếp hàng những bundle còn thiếu.

OCR là một cải tiến tùy chọn thay vì phụ thuộc cứng. Cấp `fast` Tesseract của nó hoạt động mà không cần gói; `POST /api/v1/admin/features/ocr/install` cài đặt gói RapidOCR đã ký cho `balanced` và `best` trên Linux amd64 hoặc arm64. Thời gian chạy OCR chính xác sử dụng CPU trên máy chủ chỉ dành cho CPU và NVIDIA, đồng thời yêu cầu ít nhất 4 GiB bộ nhớ hiệu dụng (giới hạn vùng chứa cgroup được định cấu hình, nếu không thì bộ nhớ máy chủ). SnapOtter báo cáo lý do tương thích `requiredMemoryBytes`, `effectiveMemoryBytes` và `insufficient-memory`, đồng thời từ chối cài đặt không tương thích trước khi tải xuống. Yêu cầu bộ nhớ này không áp dụng cho `fast`. Gói này có khoảng 208-234 MiB để tải xuống và 409-488 MiB được cài đặt, tùy thuộc vào mục tiêu; chỉ mục đã ký liên kết các kích thước chính xác được thực thi trong quá trình cài đặt.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Xác thực | Liệt kê tất cả bundle tính năng và trạng thái cài đặt của chúng |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Cài đặt một bundle tính năng (bất đồng bộ, trả về `jobId` để theo dõi tiến trình) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Cài đặt mọi bundle mà một công cụ cần; trả về trạng thái đã xếp hàng/đã bỏ qua theo từng bundle |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Gỡ cài đặt một bundle tính năng và dọn dẹp các tệp mô hình |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Lấy tổng dung lượng đĩa của các mô hình AI |
| `POST` | `/api/v1/admin/features/import` | Quản trị viên (`features:manage`) | Nhập gói AI kế thừa (`file`) hoặc bản phát hành OCR ngoại tuyến đã ký (`index` cộng với `archive`) |

Quá trình nhập OCR được air-gapped phải bao gồm `ocr-runtime-index.json` đã ký của bản phát hành và kho lưu trữ nền tảng phù hợp. SnapOtter áp dụng cùng chữ ký Ed25519, hàm băm giả, khả năng tương thích, trích xuất và kiểm tra khói được sử dụng trong quá trình cài đặt trực tuyến:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Sử dụng kho lưu trữ `linux-arm64-cpu-py311` trên arm64. Một tạo phẩm đã được ký cho một mục tiêu khác sẽ bị từ chối thay vì được cài đặt.

## Thao tác quản trị {#admin-operations}

Các endpoint vận hành cho quan sát, hỗ trợ, báo cáo sử dụng và trạng thái sao lưu.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Đọc mức log lúc chạy hiện tại |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Thay đổi mức log lúc chạy (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, hoặc `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Số liệu Prometheus ở định dạng văn bản |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Tải một bundle hỗ trợ chẩn đoán đã ẩn thông tin dưới dạng ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Dữ liệu bảng điều khiển sử dụng, với tham số truy vấn `days` tùy chọn |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Đọc metadata sao lưu gần nhất và trạng thái mới cũ |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Ghi nhận một lần sao lưu đã hoàn tất (`type`, `sizeBytes` tùy chọn, `notes` tùy chọn) |

## API Enterprise {#enterprise-apis}

Các route này bị khóa theo giấy phép của tính năng enterprise liên quan. Chúng vẫn yêu cầu quyền hạn SnapOtter được liệt kê.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Xuất các mục kiểm toán dưới dạng JSON hoặc CSV với bộ lọc |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Xuất cấu hình instance, vai trò tùy chỉnh và nhóm đã ẩn thông tin |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Nhập cấu hình, với chạy thử tùy chọn |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Đọc danh sách cho phép CIDR đã cấu hình |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Cập nhật danh sách cho phép CIDR với cơ chế ngăn tự khóa mình ra ngoài |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Liệt kê các lệnh giữ pháp lý của người dùng và nhóm |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Áp dụng hoặc gỡ bỏ lệnh giữ pháp lý cho một người dùng hoặc nhóm |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Tạo một token bearer SCIM, chỉ trả về một lần |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Thu hồi token bearer SCIM hiện tại |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Đọc cấu hình chuyển tiếp SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Cập nhật cấu hình chuyển tiếp SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Liệt kê các đích webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Tạo một đích webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Cập nhật một đích webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Xóa một đích webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Gửi một payload webhook thử nghiệm |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Bắt đầu một tác vụ xuất dữ liệu người dùng GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Đọc trạng thái xuất GDPR và URL tải xuống |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Xóa vĩnh viễn dữ liệu của một người dùng sau khi xác nhận |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Xóa vĩnh viễn dữ liệu của một nhóm sau khi xác nhận |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Đọc metadata phiên bản của app, build, Node và schema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | So sánh các migration được đóng gói với các migration đã áp dụng |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Chạy các kiểm tra sẵn sàng nâng cấp |

### SCIM 2.0 {#scim-2-0}

Các endpoint khám phá SCIM là công khai. Các endpoint người dùng và nhóm yêu cầu token bearer SCIM được tạo ở trên.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Công khai | Khả năng của máy chủ SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Công khai | Khám phá schema SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Công khai | Khám phá loại tài nguyên SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Liệt kê người dùng, với bộ lọc SCIM tùy chọn |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Tạo một người dùng |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Lấy một người dùng |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Thay thế một người dùng |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Vô hiệu hóa mềm một người dùng |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Liệt kê nhóm dưới dạng nhóm SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Tạo một nhóm |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Lấy một nhóm |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Thay thế một nhóm và thành viên nhóm |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Xóa một nhóm |

## Mẫu Meme {#meme-templates}

API hỗ trợ cho công cụ trình tạo meme.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Xác thực | Liệt kê tất cả mẫu meme có sẵn kèm vị trí các ô văn bản |
| `GET` | `/api/v1/meme-templates/full/:filename` | Xác thực | Phục vụ ảnh mẫu kích thước đầy đủ |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Xác thực | Phục vụ hình thu nhỏ của mẫu |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Xác thực | Phục vụ tệp phông chữ dùng để hiển thị văn bản meme |

## Phản hồi lỗi {#error-responses}

Mọi lỗi đều trả về JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Trạng thái | Ý nghĩa |
|--------|---------|
| 400 | Request không hợp lệ / xác thực thất bại |
| 401 | Chưa xác thực |
| 403 | Không đủ quyền hạn |
| 404 | Không tìm thấy tài nguyên |
| 413 | Tệp quá lớn (xem `MAX_UPLOAD_SIZE_MB`) |
| 422 | Xử lý thất bại sau khi xác thực |
| 429 | Bị giới hạn tốc độ (xem `RATE_LIMIT_PER_MIN`) |
| 501 | Bundle tính năng AI cần thiết chưa được cài đặt (`FEATURE_NOT_INSTALLED`) |
| 500 | Lỗi máy chủ nội bộ |
