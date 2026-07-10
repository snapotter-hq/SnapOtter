---
description: "Tài liệu tham khảo REST API đầy đủ. Điểm cuối công cụ, xử lý hàng loạt, pipeline, thư viện tệp, xác thực, nhóm, và các thao tác quản trị."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: bb7abb4c0d26
---

# Tài liệu tham khảo REST API {#rest-api-reference}

Tài liệu API tương tác với ví dụ request/response có sẵn tại [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Các đặc tả có thể đọc bằng máy:
- `/api/v1/openapi.yaml` - Đặc tả OpenAPI 3.1
- `/llms.txt` - Bản tóm tắt thân thiện với LLM
- `/llms-full.txt` - Tài liệu đầy đủ thân thiện với LLM

## Xác thực {#authentication}

Tất cả điểm cuối đều yêu cầu xác thực trừ khi `AUTH_ENABLED=false`.

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

Các khóa có tiền tố `si_` và được lưu dưới dạng băm scrypt - khóa gốc chỉ hiển thị một lần và không bao giờ lấy lại được nữa.

### Điểm cuối xác thực {#auth-endpoints}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Công khai | Đăng nhập, lấy token phiên |
| `POST` | `/api/auth/logout` | Auth | Hủy phiên hiện tại |
| `GET` | `/api/auth/session` | Auth | Xác thực phiên hiện tại |
| `POST` | `/api/auth/change-password` | Auth | Đổi mật khẩu của chính mình (vô hiệu hóa tất cả phiên khác + khóa API) |
| `GET` | `/api/auth/users` | Admin | Liệt kê tất cả người dùng |
| `POST` | `/api/auth/register` | Admin | Tạo người dùng mới |
| `PUT` | `/api/auth/users/:id` | Admin | Cập nhật vai trò hoặc nhóm của người dùng |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Đặt lại mật khẩu của người dùng |
| `DELETE` | `/api/auth/users/:id` | Admin | Xóa người dùng |
| `GET` | `/api/v1/config/auth` | Công khai | Kiểm tra xem xác thực có được bật không (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Bắt đầu đăng ký MFA TOTP. Yêu cầu tính năng enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Xác nhận đăng ký MFA với mã TOTP |
| `POST` | `/api/auth/mfa/complete` | Công khai | Hoàn tất thử thách đăng nhập MFA đang chờ |
| `POST` | `/api/auth/mfa/disable` | Auth | Vô hiệu hóa MFA cho người dùng hiện tại |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Đặt lại MFA cho một người dùng |
| `GET` | `/api/auth/oidc/login` | Công khai | Bắt đầu đăng nhập OIDC khi OIDC được bật |
| `GET` | `/api/auth/oidc/callback` | Công khai | Callback ủy quyền OIDC |
| `GET` | `/api/auth/saml/metadata` | Công khai | XML metadata SAML SP khi SAML được bật |
| `GET` | `/api/auth/saml/login` | Công khai | Bắt đầu đăng nhập SAML |
| `POST` | `/api/auth/saml/callback` | Công khai | Dịch vụ tiêu thụ assertion SAML |

Khi MFA được bật cho một người dùng, `POST /api/auth/login` trả về `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` thay vì token phiên. Gửi `mfaToken` đó cùng với mã TOTP hoặc mã khôi phục tới `/api/auth/mfa/complete`.

### Quyền hạn {#permissions}

| Quyền | Admin | User |
|-----------|:-----:|:----:|
| Dùng công cụ | ✓ | ✓ |
| Tệp/pipeline/khóa API của chính mình | ✓ | ✓ |
| Xem tệp/pipeline/khóa của mọi người dùng | ✓ | - |
| Ghi cài đặt | ✓ | - |
| Quản lý người dùng & nhóm | ✓ | - |
| Quản lý thương hiệu | ✓ | - |

## Kiểm tra sức khỏe {#health-check}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Công khai | Kiểm tra sức khỏe cơ bản. Trả về `{"status":"healthy","version":"..."}` với 200, hoặc `{"status":"unhealthy"}` với 503 nếu không kết nối được cơ sở dữ liệu. |
| `GET` | `/api/v1/readyz` | Công khai | Thăm dò sẵn sàng. Kiểm tra PostgreSQL, Redis, dung lượng đĩa, và S3 khi được cấu hình. Trả về 503 khi phiên bản không nên nhận lưu lượng. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Chẩn đoán chi tiết bao gồm thời gian hoạt động, chế độ lưu trữ, trạng thái cơ sở dữ liệu, trạng thái hàng đợi, và khả dụng GPU. |

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

- Upload là `multipart/form-data`.
- `settings` là một chuỗi JSON với các tùy chọn riêng cho công cụ.
- `clientJobId` là một trường form tùy chọn để tương quan tiến trình do caller cung cấp.
- `fileId` là một trường form tùy chọn tham chiếu đến một mục thư viện tệp hiện có. Khi có mặt, kết quả xử lý được lưu thành một phiên bản mới và response bao gồm `savedFileId`.
- **Công cụ nhanh** thường trả về 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Lấy tệp đã xử lý từ `downloadUrl`.
- **Bất kỳ công cụ được xếp hàng nào** cũng có thể trả về 202 JSON nếu nó chạy lâu hoặc vượt quá cửa sổ chờ đồng bộ: `{"jobId":"...","async":true}`. Kết nối tới SSE để lấy tiến trình, sau đó tải xuống khi hoàn tất (xem [Theo dõi tiến trình](#progress-tracking)).
- **Batch** trả về một kho lưu trữ ZIP được stream trực tiếp (với header `X-Job-Id`) cho các công cụ đã đăng ký trong sổ đăng ký batch chung.

## Tài liệu tham khảo công cụ {#tools-reference}

### Preset chuyển đổi {#conversion-presets}

Catalog dùng chung bao gồm 83 điểm cuối preset chuyển đổi chuyên dụng như `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, và `excel-to-csv`. Preset là các route công cụ hạng nhất:

`POST /api/v1/tools/<section>/<presetId>`

Mỗi preset khóa định dạng đầu ra và ủy thác cho một công cụ cơ sở như `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, hoặc `convert-spreadsheet`. Xem [Preset chuyển đổi](/vi/tools/conversion-presets) để biết bảng route đầy đủ và các cài đặt tùy chọn.

### Thiết yếu {#essentials}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `resize` | Thay đổi kích thước | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, cùng 23 preset mạng xã hội |
| `crop` | Cắt xén | `left`, `top`, `width`, `height`, `unit` (px/phần trăm) |
| `rotate` | Xoay & Lật | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Chuyển đổi | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Nén | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Tối ưu hóa {#optimization}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `optimize-for-web` | Tối ưu cho Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Loại bỏ Metadata | - |
| `edit-metadata` | Chỉnh sửa Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Đổi tên hàng loạt | `pattern` (hỗ trợ `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Ảnh sang PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Trình tạo Favicon | `padding`, `backgroundColor`, `borderRadius` - tạo tất cả kích thước chuẩn |

### Điều chỉnh {#adjustments}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `adjust-colors` | Điều chỉnh màu | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Làm sắc nét | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Thay thế màu | `sourceColor`, `targetColor` (thay thế), `makeTransparent`, `tolerance` |
| `color-blindness` | Mô phỏng mù màu | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, mặc định "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixel hóa | `blockSize` (2-128), `region` ({left, top, width, height} để pixel hóa một phần) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Công cụ AI {#ai-tools}

Tất cả công cụ AI chạy trên phần cứng của bạn: CPU theo mặc định, hoặc NVIDIA CUDA khi có GPU NVIDIA được hỗ trợ. Tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync, hoặc OpenCL hiện chưa được hỗ trợ cho suy luận AI. Không cần internet.

| ID công cụ | Tên | Mô hình AI | Cài đặt chính |
|---------|------|---------|-------------|
| `remove-background` | Xóa nền | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Phóng to ảnh | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Xóa vật thể | LaMa (ONNX) | Mask gửi làm phần tệp thứ hai (tên trường `mask`), `format`, `quality` |
| `ocr` | OCR / Trích xuất văn bản | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Làm mờ khuôn mặt / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Cắt xén thông minh | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Nâng cao chất lượng ảnh | Dựa trên phân tích | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Nâng cao khuôn mặt | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Tô màu AI | DDColor | `intensity`, `model` |
| `noise-removal` | Khử nhiễu | Khử nhiễu phân tầng | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Xóa mắt đỏ | Điểm mốc khuôn mặt + phân tích màu | `sensitivity`, `strength` |
| `restore-photo` | Phục hồi ảnh | Pipeline nhiều bước | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Ảnh hộ chiếu | Điểm mốc MediaPipe | Luồng hai giai đoạn. Phân tích dùng multipart `file`; tạo dùng JSON với `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), điểm mốc, kích thước ảnh |
| `content-aware-resize` | Thay đổi kích thước nhận biết nội dung | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Sửa lỗi trong suốt PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Thay thế nền | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Làm mờ nền | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Mở rộng canvas AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Watermark & Lớp phủ {#watermark-overlay}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `watermark-text` | Watermark văn bản | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Watermark ảnh | `opacity`, `position`, `scale` - tệp thứ hai là watermark |
| `text-overlay` | Lớp phủ văn bản | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Ghép ảnh | `x`, `y`, `opacity`, `blend` - tệp thứ hai được xếp lớp lên trên |
| `meme-generator` | Trình tạo Meme | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Hỗ trợ chế độ mẫu (thân JSON với `templateId`) hoặc chế độ ảnh tùy chỉnh (multipart với tệp). |

### Tiện ích {#utilities}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `info` | Thông tin ảnh | - (trả về chiều rộng, chiều cao, định dạng, kích thước, kênh, hasAlpha, DPI, EXIF) |
| `compare` | So sánh ảnh | `mode` (side-by-side/overlay/diff), `diffThreshold` - tệp thứ hai là mục tiêu so sánh |
| `find-duplicates` | Tìm bản trùng lặp | `threshold` (khoảng cách băm cảm nhận, mặc định 8) - đa tệp |
| `color-palette` | Bảng màu | `count` (số lượng màu chủ đạo), `format` (hex/rgb) |
| `qr-generate` | Trình tạo mã QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (tệp tùy chọn) |
| `barcode-read` | Trình đọc mã vạch | - (tự động phát hiện QR, EAN, Code128, DataMatrix, v.v.) |
| `image-to-base64` | Ảnh sang Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML sang ảnh | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Biểu đồ tần suất | `scale` (linear/log) - trả về biểu đồ tần suất RGB + thống kê theo kênh |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Trình tạo mã vạch | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Thân JSON, không upload tệp. |

### Bố cục & Ghép {#layout-composition}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `collage` | Collage / Lưới | `template` (25+ bố cục), `gap`, `backgroundColor`, `borderRadius` - đa tệp |
| `stitch` | Ghép nối / Kết hợp | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - đa tệp |
| `split` | Chia tách ảnh | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
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
| `gif-tools` | Công cụ GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), tham số riêng cho từng hành động |
| `gif-webp` | Trình chuyển đổi GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Công cụ Video {#video-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `convert-video` | Chuyển đổi Video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Nén Video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Cắt Video | `startS`, `endS`, `precise` (bool, cắt chính xác theo khung hình) |
| `mute-video` | Tắt tiếng Video | - |
| `video-to-gif` | Video sang GIF | `fps` (1-30), `width`, `startS`, `durationS` (tối đa 60s) |
| `resize-video` | Thay đổi kích thước Video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Cắt xén Video | `width`, `height`, `x`, `y` |
| `rotate-video` | Xoay Video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Thay đổi FPS | `fps` (1-120) |
| `video-color` | Màu Video | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Tốc độ Video | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Đảo ngược Video | - (tối đa 5 phút) |
| `video-loudnorm` | Chuẩn hóa âm thanh | - (EBU R128) |
| `aspect-pad` | Đệm tỷ lệ khung | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Đệm mờ | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Watermark Video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Ổn định Video | `smoothing` (5-60, theo khung hình) |
| `gif-to-video` | GIF sang Video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video sang WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video sang khung hình | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Gộp Video | - (đa tệp, chuẩn hóa theo độ phân giải của video đầu tiên) |
| `replace-audio` | Thay thế âm thanh | - (tệp video + âm thanh, hai tệp) |
| `burn-subtitles` | Ghi phụ đề vào video | `fontSize` (8-72) - tệp video + phụ đề |
| `embed-subtitles` | Nhúng phụ đề | `language` (mã ISO 639-2/B) - tệp video + phụ đề |
| `extract-subtitles` | Trích xuất phụ đề | - (xuất ra SRT) |
| `images-to-video` | Ảnh sang Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - đa tệp |
| `video-metadata` | Dọn Metadata Video | - |
| `auto-subtitles` | Phụ đề tự động (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Trích xuất âm thanh | `format` (mp3/wav/m4a/ogg) |

### Công cụ âm thanh {#audio-tools}

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
| `merge-audio` | Gộp âm thanh | `format` (mp3/wav/flac/m4a) - đa tệp |
| `split-audio` | Chia tách âm thanh | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Trình tạo nhạc chuông | `startS`, `durationS` (1-30) |
| `waveform-image` | Ảnh dạng sóng | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadata âm thanh | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Chép lời âm thanh (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Công cụ tài liệu {#document-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `merge-pdf` | Gộp PDF | - (đa tệp, tối đa 20 PDF) |
| `split-pdf` | Chia tách PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Nén PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Xoay PDF | `angle` (90/180/270), `range` (khoảng trang) |
| `extract-pages` | Trích xuất trang | `range` (cú pháp qpdf, ví dụ "1-5,8,10-z") |
| `remove-pages` | Xóa trang | `pages` (khoảng qpdf cần xóa) |
| `organize-pdf` | Sắp xếp PDF | `order` (thứ tự trang qpdf, ví dụ "3,1,2,5-z") |
| `protect-pdf` | Bảo vệ PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Mở khóa PDF | `password` |
| `repair-pdf` | Sửa chữa PDF | - |
| `linearize-pdf` | Tối ưu PDF cho Web | - (linearize để xem web nhanh) |
| `grayscale-pdf` | PDF thang xám | - |
| `pdfa-convert` | Chuyển sang PDF/A | - (PDF/A-2 lưu trữ) |
| `crop-pdf` | Cắt xén PDF | `margin` (0-2000 điểm) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Sổ tay PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Watermark PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Số trang PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Làm phẳng PDF | - (bake form và chú thích) |
| `redact-pdf` | Kiểm duyệt PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Ký PDF | Route multipart tùy chỉnh với PDF `file`, tệp chữ ký `sig0`, `sig1`, và mảng JSON `placements` |
| `pdf-to-text` | PDF sang văn bản | - |
| `pdf-to-word` | PDF sang Word | - |
| `pdf-metadata` | Metadata PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Chuyển đổi tài liệu | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Chuyển đổi bài thuyết trình | `format` (pptx/odp) |
| `convert-spreadsheet` | Chuyển đổi bảng tính | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel sang PDF | - |
| `word-to-pdf` | Word sang PDF | - |
| `powerpoint-to-pdf` | PowerPoint sang PDF | - |
| `html-to-pdf` | HTML sang PDF | - (tài nguyên từ xa bị vô hiệu hóa) |
| `markdown-to-docx` | Markdown sang Word | - |
| `markdown-to-html` | Markdown sang HTML | - |
| `markdown-to-pdf` | Markdown sang PDF | - (tài nguyên từ xa bị vô hiệu hóa) |
| `epub-convert` | Chuyển đổi EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Chuyển sang EPUB | - (chấp nhận .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR PDF (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF sang ảnh | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF sang JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF sang PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF sang TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Công cụ tệp {#file-tools}

| ID công cụ | Tên | Cài đặt chính |
|---------|------|-------------|
| `chart-maker` | Trình tạo biểu đồ | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV sang Excel | `sheet` (số worksheet cho đầu vào XLSX) - hai chiều |
| `csv-json` | CSV sang JSON | `pretty` (bool) - hai chiều |
| `json-xml` | JSON sang XML | `pretty` (bool) - hai chiều |
| `split-csv` | Chia tách CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Gộp CSV | - (đa tệp, cột khớp nhau) |
| `yaml-json` | YAML / JSON | - (hai chiều) |
| `xml-to-csv` | XML sang CSV | - (tự động tìm phần tử lặp) |
| `excel-to-csv` | Excel sang CSV | preset chuyển đổi chuyên dụng dựa trên `convert-spreadsheet` |
| `create-zip` | Tạo ZIP | - (đa tệp, 2-50 tệp) |
| `extract-zip` | Giải nén ZIP | - (được bảo vệ chống bom) |

### HTML sang ảnh {#html-to-image}

Chụp một trang web thành ảnh. Khác với các công cụ khác, điểm cuối này chấp nhận `application/json` thay vì dữ liệu form multipart (không cần upload tệp).

**Điểm cuối:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `url` | string | (bắt buộc) | URL để chụp (chỉ http/https) |
| `format` | string | `"png"` | Định dạng đầu ra: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Chất lượng 1-100 (chỉ JPG/WebP) |
| `fullPage` | boolean | `false` | Chụp toàn bộ trang có thể cuộn |
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

Một số công cụ cung cấp điểm cuối bổ sung ngoài `POST /api/v1/tools/<section>/<toolId>` tiêu chuẩn:

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Trả về ID công cụ phổ biến, quay lại danh sách mặc định được tuyển chọn khi dữ liệu sử dụng thưa thớt |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Áp dụng hiệu ứng nền (color/gradient/blur/shadow) mà không chạy lại AI. Dùng mask đã lưu từ lần xóa ban đầu. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Đọc metadata EXIF/IPTC/XMP hiện có từ một ảnh |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Kiểm tra các trường metadata trước khi loại bỏ |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Giai đoạn 1: Phát hiện khuôn mặt AI + xóa nền. Trả về điểm mốc khuôn mặt và dữ liệu đã lưu. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Giai đoạn 2: Cắt xén, thay đổi kích thước, và xếp lát bằng phân tích đã lưu. Không chạy lại AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Lấy metadata GIF (số khung hình, kích thước, thời lượng) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Lấy metadata PDF (số trang, kích thước) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Tạo bản xem trước của một trang PDF cụ thể |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Lấy metadata PDF cho preset JPG chuyên dụng |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Tạo bản xem trước trang PDF preset JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Lấy metadata PDF cho preset PNG chuyên dụng |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Tạo bản xem trước trang PDF preset PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Lấy metadata PDF cho preset TIFF chuyên dụng |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Tạo bản xem trước trang PDF preset TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Chuyển đổi hàng loạt nhiều SVG sang raster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Phân tích chất lượng ảnh và trả về đề xuất nâng cao |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Bản xem trước nhẹ để tinh chỉnh tham số trực tiếp. Trả về ảnh đã tối ưu với header kích thước. |

## Xử lý hàng loạt {#batch-processing}

Áp dụng một công cụ hỗ trợ batch chung cho nhiều tệp cùng lúc. Trả về một kho lưu trữ ZIP. Các route đa tệp hoặc nhiều bước tùy chỉnh, như ký PDF, OCR PDF, và các route preset PDF sang ảnh, dùng hợp đồng điểm cuối riêng thay vì route `/batch` chung.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Độ đồng thời được kiểm soát bởi `CONCURRENT_JOBS` (mặc định: tự động phát hiện từ các nhân CPU). `MAX_BATCH_SIZE` giới hạn số tệp mỗi batch (mặc định: 100; đặt 0 để không giới hạn).

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

Đầu ra của mỗi bước là đầu vào của bước tiếp theo. Pipeline cho phép 20 bước theo mặc định, có thể cấu hình qua `MAX_PIPELINE_STEPS`. Đặt `MAX_PIPELINE_STEPS=0` để bỏ giới hạn.

### Lưu và quản lý pipeline {#save-and-manage-pipelines}

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Lưu một pipeline có tên (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Liệt kê các pipeline đã lưu (admin thấy tất cả; user thấy của mình) |
| `DELETE` | `/api/v1/pipeline/:id` | Xóa (chủ sở hữu hoặc admin) |
| `GET` | `/api/v1/pipeline/tools` | Liệt kê các ID công cụ hợp lệ cho các bước pipeline |

## Theo dõi tiến trình {#progress-tracking}

Các job chạy lâu, công cụ được xếp hàng, job batch, và pipeline phát tiến trình theo thời gian thực qua Server-Sent Events. Luồng tiến trình là công khai và được khóa theo ID job, nên client không cần gửi header Authorization để đọc nó.

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

Bạn có thể yêu cầu hủy một job đang xếp hàng hoặc đang chạy với `POST /api/v1/jobs/:jobId/cancel`. Response là `{"canceled":true|false}`.

## Thư viện tệp {#file-library}

Lưu trữ tệp bền vững với lịch sử phiên bản.

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Upload tệp vào workspace (xử lý tạm thời) |
| `POST` | `/api/v1/files/upload` | Upload tệp vào thư viện tệp bền vững |
| `POST` | `/api/v1/files/save-result` | Lưu kết quả xử lý của công cụ thành một phiên bản tệp mới |
| `GET` | `/api/v1/files` | Liệt kê các tệp đã lưu (phân trang, có tìm kiếm) |
| `GET` | `/api/v1/files/:id` | Lấy metadata tệp + chuỗi phiên bản |
| `GET` | `/api/v1/files/:id/download` | Tải xuống tệp |
| `GET` | `/api/v1/files/:id/thumbnail` | Lấy hình thu nhỏ JPEG 300px |
| `DELETE` | `/api/v1/files` | Xóa hàng loạt tệp và chuỗi phiên bản của chúng (thân: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Lấy URL từ xa vào workspace để nhập dựa trên URL |
| `POST` | `/api/v1/preview` | Tạo bản xem trước WebP tương thích trình duyệt (cho định dạng HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Stream bản xem trước đã lưu cache hoặc được tạo tương thích trình duyệt cho một tệp PDF, tài liệu office, video, hoặc âm thanh đã lưu |
| `POST` | `/api/v1/preview/generate` | Tạo bản xem trước MP4 hoặc MP3 theo yêu cầu cho một tệp media đã upload mà không cần lưu trước |
| `GET` | `/api/v1/download/:jobId/:filename` | Tải xuống một tệp đã xử lý từ workspace |

Để tự động lưu kết quả công cụ vào thư viện, hãy bao gồm `fileId` làm trường form multipart tham chiếu một tệp thư viện hiện có. Kết quả xử lý sẽ được lưu thành một phiên bản mới.

## Quản lý khóa API {#api-key-management}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Tạo khóa mới - hiển thị một lần |
| `GET` | `/api/v1/api-keys` | Auth | Liệt kê khóa (name, id, lastUsedAt - không phải khóa gốc) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Xóa khóa |

## Nhóm {#teams}

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Liệt kê nhóm |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Tạo nhóm |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Đổi tên nhóm |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Xóa nhóm (không thể xóa nhóm mặc định hoặc nhóm có thành viên) |

## Cài đặt {#settings}

Cấu hình khóa-giá trị lúc chạy (đọc bởi bất kỳ người dùng đã xác thực nào, chỉ admin mới ghi được).

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Lấy tất cả cài đặt |
| `PUT` | `/api/v1/settings` | Cập nhật hàng loạt cài đặt (thân JSON với các cặp khóa-giá trị) |
| `GET` | `/api/v1/settings/:key` | Lấy một cài đặt cụ thể theo khóa |

Các khóa đã biết: `disabledTools` (mảng JSON các ID công cụ), `enableExperimentalTools` (chuỗi bool), `loginAttemptLimit` (số).

## Tùy chọn {#preferences}

Tùy chọn theo từng người dùng tách biệt với cài đặt phiên bản. Bất kỳ người dùng đã xác thực nào cũng có thể đọc và cập nhật bản đồ tùy chọn của chính mình.

| Phương thức | Đường dẫn | Mô tả |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Lấy tùy chọn của người dùng hiện tại dưới dạng `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Chèn hoặc cập nhật một hoặc nhiều khóa tùy chọn cho người dùng hiện tại |

## Vai trò {#roles}

Quản lý vai trò tùy chỉnh với các quyền hạn chi tiết.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Liệt kê tất cả vai trò với số lượng người dùng |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Tạo một vai trò tùy chỉnh (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Cập nhật một vai trò tùy chỉnh (không thể sửa vai trò tích hợp sẵn) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Xóa một vai trò tùy chỉnh (không thể xóa vai trò tích hợp sẵn; người dùng bị ảnh hưởng quay về vai trò `user`) |

Các quyền có sẵn (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Nhật ký kiểm toán {#audit-log}

Điểm cuối chỉ dành cho admin để xem xét các hành động liên quan đến bảo mật.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Nhật ký kiểm toán phân trang với bộ lọc tùy chọn |

Tham số truy vấn:

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
| `GET` | `/api/v1/config/analytics` | Công khai | Lấy cấu hình phân tích hiệu lực (khóa PostHog, DSN Sentry, tỷ lệ mẫu). Khóa, DSN, và ID phiên bản để trống khi phân tích tắt, dù từ bake lúc biên dịch hay cài đặt phiên bản `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Gửi phản hồi người dùng rõ ràng tới dự án PostHog đã cấu hình dưới dạng `feedback_submitted`. Route tôn trọng cổng phân tích, giới hạn tốc độ gửi, loại bỏ các trường liên hệ trừ khi `contactOk` là true, và không bao giờ chấp nhận nội dung tệp, tên tệp, đường dẫn upload, hoặc văn bản lỗi riêng tư thô. Khi phân tích bị tắt, nó trả về `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Đặt tùy chọn từ chối trên toàn phiên bản. Gửi thân JSON `{ "analyticsEnabled": "false" }` để tắt phân tích cho mọi người, hoặc `"true"` để bật lại. |

## Tính năng / AI Bundle {#features-ai-bundles}

Quản lý các bundle tính năng AI (cài đặt/gỡ cài đặt các gói mô hình AI trong môi trường Docker).

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Liệt kê tất cả bundle tính năng và trạng thái cài đặt của chúng |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Cài đặt một bundle tính năng (bất đồng bộ, trả về `jobId` để theo dõi tiến trình) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Gỡ cài đặt một bundle tính năng và dọn dẹp các tệp mô hình |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Lấy tổng dung lượng đĩa của các mô hình AI |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Nhập một kho lưu trữ bundle AI ngoại tuyến |

## Thao tác quản trị {#admin-operations}

Các điểm cuối vận hành cho khả năng quan sát, hỗ trợ, báo cáo sử dụng, và trạng thái sao lưu.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Đọc mức log lúc chạy hiện tại |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Thay đổi mức log lúc chạy (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, hoặc `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Chỉ số Prometheus ở định dạng văn bản |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Tải xuống một bundle hỗ trợ chẩn đoán đã che giấu dưới dạng ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Dữ liệu bảng điều khiển sử dụng, với tham số truy vấn `days` tùy chọn |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Đọc metadata sao lưu gần nhất và trạng thái mới |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Ghi lại một lần sao lưu hoàn tất (`type`, `sizeBytes` tùy chọn, `notes` tùy chọn) |

## API Enterprise {#enterprise-apis}

Các route này được kiểm soát bằng giấy phép theo tính năng enterprise liên quan. Chúng vẫn yêu cầu quyền SnapOtter được liệt kê.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Xuất các mục kiểm toán dưới dạng JSON hoặc CSV với bộ lọc |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Xuất cấu hình phiên bản đã che giấu, vai trò tùy chỉnh, và nhóm |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Nhập cấu hình, với chạy thử tùy chọn |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Đọc danh sách CIDR cho phép đã cấu hình |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Cập nhật danh sách CIDR cho phép với ngăn chặn tự khóa |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Liệt kê các lệnh giữ pháp lý của người dùng và nhóm |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Áp dụng hoặc gỡ một lệnh giữ pháp lý trên một người dùng hoặc nhóm |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Tạo một token bearer SCIM, trả về một lần |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Thu hồi token bearer SCIM hiện tại |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Đọc cấu hình chuyển tiếp SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Cập nhật cấu hình chuyển tiếp SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Liệt kê các đích webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Tạo một đích webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Cập nhật một đích webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Xóa một đích webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Gửi một payload webhook thử nghiệm |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Bắt đầu một job xuất dữ liệu người dùng GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Đọc trạng thái xuất GDPR và URL tải xuống |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Xóa vĩnh viễn dữ liệu của người dùng sau khi xác nhận |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Xóa vĩnh viễn dữ liệu của nhóm sau khi xác nhận |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Đọc metadata phiên bản app, build, Node, và schema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | So sánh các migration được đóng gói với các migration đã áp dụng |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Chạy các kiểm tra sẵn sàng nâng cấp |

### SCIM 2.0 {#scim-2-0}

Các điểm cuối khám phá SCIM là công khai. Các điểm cuối người dùng và nhóm yêu cầu token bearer SCIM được tạo ở trên.

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
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Thay thế một nhóm và tư cách thành viên nhóm |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Xóa một nhóm |

## Mẫu Meme {#meme-templates}

API hỗ trợ cho công cụ tạo meme.

| Phương thức | Đường dẫn | Quyền truy cập | Mô tả |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Liệt kê tất cả mẫu meme có sẵn với vị trí ô văn bản |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Phục vụ ảnh mẫu kích thước đầy đủ |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Phục vụ hình thu nhỏ mẫu |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Phục vụ tệp font dùng để hiển thị văn bản meme |

## Response lỗi {#error-responses}

Tất cả lỗi trả về JSON:

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
| 403 | Quyền hạn không đủ |
| 404 | Không tìm thấy tài nguyên |
| 413 | Tệp quá lớn (xem `MAX_UPLOAD_SIZE_MB`) |
| 422 | Xử lý thất bại sau khi xác thực |
| 429 | Bị giới hạn tốc độ (xem `RATE_LIMIT_PER_MIN`) |
| 501 | Bundle tính năng AI cần thiết chưa được cài đặt (`FEATURE_NOT_INSTALLED`) |
| 500 | Lỗi máy chủ nội bộ |
