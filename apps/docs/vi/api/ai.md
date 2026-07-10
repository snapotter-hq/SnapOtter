---
description: "Tài liệu tham khảo về engine AI với tất cả công cụ ML cục bộ. Xóa nền, nâng cấp độ phân giải, OCR, phát hiện khuôn mặt, phục hồi ảnh, và nhiều hơn nữa."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 19098d481908
---

# Tài liệu tham khảo Engine AI {#ai-engine-reference}

Gói `@snapotter/ai` kết nối Node.js với một **sidecar Python thường trú** cho mọi thao tác ML. Tiến trình dispatcher luôn hoạt động giữa các yêu cầu để có hiệu năng khởi động ấm nhanh chóng. NVIDIA CUDA được tự động phát hiện khi khởi động và được dùng khi có sẵn; nếu không, các công cụ AI chạy trên CPU.

Tăng tốc iGPU Intel/AMD thông qua VA-API, Quick Sync, hoặc OpenCL hiện không được hỗ trợ cho suy luận AI. Việc ánh xạ `/dev/dri` vào một container không giúp tăng tốc các công cụ sidecar Python này trừ khi có GPU NVIDIA hỗ trợ CUDA.

19 công cụ AI sidecar Python trên bốn phương thức (hình ảnh, âm thanh, video, tài liệu), cùng 2 công cụ có khả năng AI tùy chọn. Tất cả mô hình chạy cục bộ - không cần internet sau khi tải mô hình lần đầu.

## Kiến trúc {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Một hồ sơ dispatcher "docs" riêng biệt thay thế danh sách cho phép của AI bằng các script xử lý tài liệu (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) và bỏ qua các import ML nặng.

**Thời gian chờ:** 300 giây mặc định; OCR và xóa nền BiRefNet được 600 giây.

## Gói Tính năng {#feature-bundles}

Mỗi công cụ AI yêu cầu cài đặt một gói mô hình trước khi dùng. Các gói được cài đặt theo yêu cầu thông qua giao diện quản trị hoặc `install_feature.py`.

| Gói | Kích thước | Công cụ |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Xóa Nền {#background-removal}

**Đường dẫn công cụ:** `remove-background`  
**Mô hình:** rembg với BiRefNet (mặc định) hoặc các biến thể U2-Net

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `model` | string | - | Biến thể mô hình (ghi đè tùy chọn) |
| `backgroundType` | string | `"transparent"` | Một trong: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Mã màu hex cho nền đơn sắc |
| `gradientColor1` | string | - | Màu gradient thứ nhất |
| `gradientColor2` | string | - | Màu gradient thứ hai |
| `gradientAngle` | number | - | Góc gradient tính bằng độ |
| `blurEnabled` | boolean | - | Bật hiệu ứng làm mờ nền |
| `blurIntensity` | number (0-100) | - | Cường độ làm mờ |
| `shadowEnabled` | boolean | - | Bật đổ bóng trên chủ thể |
| `shadowOpacity` | number (0-100) | - | Độ mờ đục của bóng |
| `outputFormat` | string | - | Định dạng đầu ra: `png`, `webp`, hoặc `avif` |
| `edgeRefine` | integer (0-3) | - | Mức độ tinh chỉnh cạnh |
| `decontaminate` | boolean | - | Loại bỏ nhòe màu ở các cạnh |

## Thay Nền {#background-replace}

**Đường dẫn công cụ:** `background-replace`  
**Mô hình:** rembg / BiRefNet (dùng chung với remove-background)

Xóa nền và thay bằng màu đơn sắc hoặc gradient.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Chế độ nền |
| `color` | string | `"#ffffff"` | Màu nền hex (khi `backgroundType` là `color`) |
| `gradientColor1` | string | - | Màu hex gradient thứ nhất |
| `gradientColor2` | string | - | Màu hex gradient thứ hai |
| `gradientAngle` | integer (0-360) | `180` | Góc gradient tính bằng độ |
| `feather` | integer (0-20) | `0` | Bán kính làm mềm cạnh |
| `format` | `"png"` \| `"webp"` | `"png"` | Định dạng đầu ra |

## Làm Mờ Nền {#blur-background}

**Đường dẫn công cụ:** `blur-background`  
**Mô hình:** rembg / BiRefNet (dùng chung với remove-background)

Làm mờ nền trong khi giữ chủ thể sắc nét.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Cường độ làm mờ |
| `feather` | integer (0-20) | `0` | Bán kính làm mềm cạnh |
| `format` | `"png"` \| `"webp"` | `"png"` | Định dạng đầu ra |

## Nâng Cấp Độ Phân Giải Ảnh {#image-upscaling}

**Đường dẫn công cụ:** `upscale`  
**Mô hình:** RealESRGAN (với dự phòng Lanczos khi không có sẵn)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Hệ số nâng cấp |
| `model` | string | `"auto"` | Biến thể mô hình |
| `faceEnhance` | boolean | `false` | Áp dụng bước tăng cường khuôn mặt GFPGAN |
| `denoise` | number | `0` | Cường độ khử nhiễu |
| `format` | string | `"auto"` | Ghi đè định dạng đầu ra |
| `quality` | number | `95` | Chất lượng đầu ra (1-100) |

## OCR / Trích Xuất Văn Bản {#ocr-text-extraction}

**Đường dẫn công cụ:** `ocr`  
**Mô hình:** Tesseract (nhanh), PaddleOCR PP-OCRv5 (cân bằng), PaddleOCR-VL 1.5 (tốt nhất)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Bậc xử lý |
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Tiền xử lý ảnh để cải thiện độ chính xác OCR |
| `engine` | string | - | Đã lỗi thời. Ánh xạ `tesseract` thành `fast`, `paddleocr` thành `balanced` |

Trả về kết quả có cấu trúc với các hộp giới hạn, điểm tin cậy, và các khối văn bản được trích xuất.

## OCR PDF {#pdf-ocr}

**Đường dẫn công cụ:** `ocr-pdf`  
**Mô hình:** Cùng hệ thống bậc như OCR ảnh

Trích xuất văn bản từ tài liệu PDF quét bằng OCR do AI hỗ trợ, theo từng trang.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Bậc xử lý |
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Chọn trang: `"all"`, `"1-3"`, `"1,3,5"` |

## Làm Mờ Khuôn Mặt / PII {#face-pii-blur}

**Đường dẫn công cụ:** `blur-faces`  
**Mô hình:** Phát hiện khuôn mặt MediaPipe

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Bán kính làm mờ Gaussian |
| `sensitivity` | number (0-1) | `0.5` | Ngưỡng tin cậy phát hiện |

## Tăng Cường Khuôn Mặt {#face-enhancement}

**Đường dẫn công cụ:** `enhance-faces`  
**Mô hình:** GFPGAN, CodeFormer

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Mô hình tăng cường |
| `strength` | number (0-1) | `0.8` | Cường độ tăng cường |
| `sensitivity` | number (0-1) | `0.5` | Ngưỡng phát hiện khuôn mặt |
| `onlyCenterFace` | boolean | `false` | Chỉ tăng cường khuôn mặt trung tâm nhất |

## Tô Màu AI {#ai-colorization}

**Đường dẫn công cụ:** `colorize`  
**Mô hình:** DDColor (với dự phòng OpenCV DNN)

Chuyển ảnh đen trắng hoặc thang xám thành ảnh màu đầy đủ.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Cường độ bão hòa màu |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Biến thể mô hình |

## Khử Nhiễu {#noise-removal}

**Đường dẫn công cụ:** `noise-removal`  
**Mô hình:** SCUNet (pipeline khử nhiễu phân bậc)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Bậc xử lý |
| `strength` | number (0-100) | `50` | Cường độ khử nhiễu |
| `detailPreservation` | number (0-100) | `50` | Mức chi tiết cần giữ; giá trị cao hơn giữ nhiều kết cấu hơn |
| `colorNoise` | number (0-100) | `30` | Cường độ giảm nhiễu màu |
| `format` | string | `"original"` | Định dạng đầu ra: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Chất lượng mã hóa đầu ra |

## Xóa Mắt Đỏ {#red-eye-removal}

**Đường dẫn công cụ:** `red-eye-removal`

Phát hiện điểm mốc khuôn mặt, định vị vùng mắt, và hiệu chỉnh tình trạng bão hòa quá mức kênh đỏ.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Ngưỡng phát hiện điểm ảnh đỏ |
| `strength` | number (0-100) | `70` | Cường độ hiệu chỉnh |
| `format` | string | - | Ghi đè định dạng đầu ra (tùy chọn) |
| `quality` | number (1-100) | `90` | Chất lượng đầu ra |

## Phục Hồi Ảnh {#photo-restoration}

**Đường dẫn công cụ:** `restore-photo`

Pipeline nhiều bước cho ảnh cũ hoặc hư hỏng: phát hiện và sửa vết xước/rách, tăng cường khuôn mặt, khử nhiễu, và tô màu tùy chọn.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Phát hiện và sửa vết xước, vết rách |
| `faceEnhancement` | boolean | `true` | Áp dụng bước tăng cường khuôn mặt |
| `fidelity` | number (0-1) | `0.7` | Cường độ tăng cường khuôn mặt (cao hơn = thận trọng hơn) |
| `denoise` | boolean | `true` | Áp dụng bước khử nhiễu |
| `denoiseStrength` | number (0-100) | `25` | Cường độ khử nhiễu |
| `colorize` | boolean | `false` | Tô màu sau khi phục hồi |
| `colorizeStrength` | number (0-100) | `85` | Cường độ tô màu |

## Ảnh Hộ Chiếu {#passport-photo}

**Đường dẫn công cụ:** `passport-photo`  
**Mô hình:** Điểm mốc khuôn mặt MediaPipe + xóa nền BiRefNet

Quy trình hai giai đoạn: phân tích (phát hiện khuôn mặt + xóa nền) rồi tạo (cắt, đổi kích thước, lát). Hỗ trợ hơn 37 quốc gia trên 6 khu vực.

### Giai đoạn 1: Phân tích {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Nhận một tệp ảnh (multipart). Trả về dữ liệu điểm mốc khuôn mặt, bản xem trước base64, và kích thước ảnh.

### Giai đoạn 2: Tạo {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Nhận một phần thân JSON với kết quả Giai đoạn 1 cùng các cài đặt tạo:

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `jobId` | string | (bắt buộc) | ID công việc từ Giai đoạn 1 |
| `filename` | string | (bắt buộc) | Tên tệp gốc từ Giai đoạn 1 |
| `countryCode` | string | (bắt buộc) | Mã quốc gia ISO (ví dụ: `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Loại tài liệu |
| `bgColor` | string | `"#FFFFFF"` | Mã màu hex nền |
| `printLayout` | string | `"none"` | Bố cục in: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Kích thước tệp tối đa tính bằng KB (0 = không giới hạn) |
| `dpi` | number (72-1200) | `300` | DPI đầu ra |
| `customWidthMm` | number | - | Chiều rộng tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| `customHeightMm` | number | - | Chiều cao tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| `zoom` | number (0.5-3) | `1` | Hệ số thu phóng |
| `adjustX` | number | `0` | Điều chỉnh vị trí ngang |
| `adjustY` | number | `0` | Điều chỉnh vị trí dọc |
| `landmarks` | object | (bắt buộc) | Điểm mốc từ Giai đoạn 1 |
| `imageWidth` | number | (bắt buộc) | Chiều rộng ảnh từ Giai đoạn 1 |
| `imageHeight` | number | (bắt buộc) | Chiều cao ảnh từ Giai đoạn 1 |

## Xóa Đối Tượng (Inpainting) {#object-erasing-inpainting}

**Đường dẫn công cụ:** `erase-object`  
**Mô hình:** LaMa qua ONNX Runtime

Mặt nạ được gửi dưới dạng **phần tệp thứ hai** (tên trường `mask`), không phải dạng base64. Điểm ảnh trắng trong mặt nạ chỉ vùng cần xóa. Các cài đặt `format` và `quality` được gửi dưới dạng trường biểu mẫu cấp cao nhất.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `file` | file | (bắt buộc) | Ảnh nguồn (multipart) |
| `mask` | file | (bắt buộc) | Ảnh mặt nạ (multipart, tên trường `mask`, trắng = xóa) |
| `format` | string | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Chất lượng đầu ra |

Được tăng tốc bằng CUDA khi có GPU NVIDIA.

## Mở Rộng Khung AI {#ai-canvas-expand}

**Đường dẫn công cụ:** `ai-canvas-expand`  
**Mô hình:** Outpainting dựa trên LaMa

Mở rộng khung ảnh theo bất kỳ hướng nào và lấp đầy các vùng mới bằng nội dung do AI tạo khớp với ảnh hiện có.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Số điểm ảnh mở rộng ở phía trên |
| `extendRight` | integer | `0` | Số điểm ảnh mở rộng ở bên phải |
| `extendBottom` | integer | `0` | Số điểm ảnh mở rộng ở phía dưới |
| `extendLeft` | integer | `0` | Số điểm ảnh mở rộng ở bên trái |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Bậc chất lượng |
| `format` | string | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Chất lượng đầu ra |

Ít nhất một hướng mở rộng phải lớn hơn 0.

## Cắt Thông Minh {#smart-crop}

**Đường dẫn công cụ:** `smart-crop`  
**Mô hình:** Phát hiện khuôn mặt MediaPipe (chỉ chế độ khuôn mặt)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Chiến lược cắt: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Chiến lược cho chế độ chủ thể |
| `width` | integer | - | Chiều rộng đầu ra |
| `height` | integer | - | Chiều cao đầu ra |
| `padding` | integer (0-50) | `0` | Phần trăm đệm quanh chủ thể |
| `facePreset` | string | `"head-shoulders"` | Khung định sẵn khi `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Ngưỡng phát hiện khuôn mặt |
| `threshold` | integer (0-255) | `30` | Ngưỡng phát hiện nền (chế độ cắt viền) |
| `padToSquare` | boolean | `false` | Đệm kết quả đã cắt viền thành hình vuông |
| `padColor` | string | `"#ffffff"` | Màu nền cho đệm vuông |
| `targetSize` | integer | - | Kích thước mục tiêu cho đầu ra đã đệm (điểm ảnh) |
| `quality` | integer (1-100) | - | Chất lượng đầu ra |

Các giá trị `mode` cũ `attention` và `content` được chấp nhận và ánh xạ lần lượt thành `subject` và `trim`.

**Định sẵn khuôn mặt:**

| Định sẵn | Phù hợp nhất cho |
|--------|---------|
| `closeup` | Ảnh chân dung cận cảnh |
| `head-shoulders` | Ảnh hồ sơ |
| `upper-body` | LinkedIn / trang trọng |
| `half-body` | Toàn bộ thân trên |

## Chuyển Âm Thanh Thành Văn Bản {#transcribe-audio}

**Đường dẫn công cụ:** `transcribe-audio`  
**Mô hình:** faster-whisper

Chuyển lời nói thành văn bản. Hỗ trợ các định dạng đầu ra văn bản thuần, SRT, và VTT.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Định dạng đầu ra |

## Phụ Đề Tự Động {#auto-subtitles}

**Đường dẫn công cụ:** `auto-subtitles`  
**Mô hình:** faster-whisper (trích xuất âm thanh từ video, rồi chuyển thành văn bản)

Tạo tệp phụ đề từ dải âm thanh của video.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Định dạng phụ đề đầu ra |

## Sửa Độ Trong Suốt PNG {#png-transparency-fixer}

**Đường dẫn công cụ:** `transparency-fixer`  
**Mô hình:** BiRefNet HR-matting (độ phân giải 2048x2048)

Sửa các PNG "trong suốt giả" nơi nền đã bị xóa nhưng còn để lại viền rìa, quầng sáng, hoặc hiện vật bán trong suốt. Dùng mô hình matting độ phân giải cao của BiRefNet để tạo kênh alpha sạch, rồi áp dụng xử lý khử viền có thể cấu hình để loại bỏ nhiễm màu dọc theo các cạnh.

**Chuỗi dự phòng khi hết bộ nhớ:** Nếu BiRefNet HR-matting vượt quá bộ nhớ khả dụng, công cụ tự động dự phòng sang `birefnet-general`, rồi sang `u2net`.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Cường độ khử viền cạnh để loại bỏ nhiễm màu |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Định dạng ảnh đầu ra |
| `removeWatermark` | boolean | `false` | Áp dụng tiền xử lý xóa watermark (bộ lọc trung vị) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Công cụ có Khả năng AI Tùy chọn {#tools-with-optional-ai-capabilities}

Các công cụ sau không phải công cụ sidecar Python nhưng dùng tính năng AI khi một số tùy chọn được bật.

### Tăng Cường Ảnh {#image-enhancement}

**Đường dẫn công cụ:** `image-enhancement`  
**Engine:** Dựa trên phân tích (biểu đồ tần suất và thống kê Sharp)

Phân tích ảnh và áp dụng hiệu chỉnh tự động cho phơi sáng, tương phản, cân bằng trắng, độ bão hòa, độ sắc nét, và nhiễu. Hỗ trợ các chế độ theo cảnh cụ thể.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Chế độ cảnh để tinh chỉnh hiệu chỉnh |
| `intensity` | number (0-100) | `50` | Cường độ hiệu chỉnh tổng thể |
| `corrections.exposure` | boolean | `true` | Áp dụng hiệu chỉnh phơi sáng |
| `corrections.contrast` | boolean | `true` | Áp dụng hiệu chỉnh tương phản |
| `corrections.whiteBalance` | boolean | `true` | Áp dụng hiệu chỉnh cân bằng trắng |
| `corrections.saturation` | boolean | `true` | Áp dụng hiệu chỉnh độ bão hòa |
| `corrections.sharpness` | boolean | `true` | Áp dụng hiệu chỉnh độ sắc nét |
| `corrections.denoise` | boolean | `true` | Áp dụng khử nhiễu |
| `deepEnhance` | boolean | `false` | Bật khử nhiễu AI qua SCUNet (yêu cầu gói `upscale-enhance`) |

Có thêm một endpoint phân tích tại `POST /api/v1/tools/image/image-enhancement/analyze` trả về các hiệu chỉnh được phát hiện mà không áp dụng chúng.

### Đổi Kích Thước Nhận Biết Nội Dung (Seam Carving) {#content-aware-resize-seam-carving}

**Đường dẫn công cụ:** `content-aware-resize`  
**Engine:** Nhị phân Go `caire` (không phải Python - không hưởng lợi từ GPU)

Đổi kích thước ảnh một cách thông minh bằng cách loại bỏ các đường nối năng lượng thấp, giữ lại nội dung quan trọng.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `width` | number | - | Chiều rộng mục tiêu |
| `height` | number | - | Chiều cao mục tiêu |
| `protectFaces` | boolean | `false` | Bảo vệ vùng khuôn mặt được phát hiện (yêu cầu gói `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Làm mờ trước để tính năng lượng |
| `sobelThreshold` | number (1-20) | `2` | Ngưỡng độ nhạy cạnh |
| `square` | boolean | `false` | Buộc đầu ra vuông |
