---
description: "Tài liệu tham khảo engine AI với tất cả công cụ ML chạy cục bộ. Xóa nền, upscale, OCR, phát hiện khuôn mặt, phục chế ảnh và nhiều tính năng khác."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 5f94f953cb34
---

# Tài liệu tham khảo Engine AI {#ai-engine-reference}

Gói `@snapotter/ai` kết nối Node.js với một **sidecar Python thường trực** cho mọi thao tác ML. Tiến trình dispatcher luôn chạy giữa các yêu cầu để đạt hiệu năng khởi động ấm nhanh. NVIDIA CUDA được tự động phát hiện khi khởi động và dùng khi có sẵn; nếu không, các công cụ AI chạy trên CPU.

Hiện chưa hỗ trợ tăng tốc iGPU Intel/AMD qua VA-API, Quick Sync hay OpenCL cho suy luận AI. Việc ánh xạ `/dev/dri` vào container không tăng tốc các công cụ sidecar Python này trừ khi có một GPU NVIDIA hỗ trợ CUDA.

19 công cụ AI sidecar Python trên bốn phương thức (ảnh, âm thanh, video, tài liệu), cộng thêm 2 công cụ có khả năng AI tùy chọn. Mọi mô hình đều chạy cục bộ, không cần internet sau khi tải mô hình lần đầu.

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

Một hồ sơ dispatcher "docs" riêng thay thế danh sách cho phép AI bằng các script xử lý tài liệu (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) và bỏ qua việc import các thư viện ML nặng.

**Thời gian chờ:** mặc định 300 giây; OCR và xóa nền BiRefNet được cấp 600 giây.

## Gói tính năng {#feature-bundles}

Các mô hình AI được đóng gói theo ngăn xếp phụ thuộc dùng chung, không phải một kho lưu trữ cho mỗi công cụ. Một gói tính năng có thể bật nhiều công cụ khi chúng dùng cùng họ mô hình, wheel Python hoặc thư viện native. Điều này giúp image Docker phát hành nhỏ hơn và tránh lưu trữ các bản sao trùng lặp của cùng một mô hình matting nền, phát hiện khuôn mặt, OCR, phục chế và giọng nói.

Image Docker đi kèm ứng dụng cộng với runtime chung. Các kho lưu trữ mô hình lớn được tải theo yêu cầu vào volume `/data/ai` thường trực, rồi được tái sử dụng bởi mọi công cụ cần đến. Nếu một gói đã được cài vì công cụ khác cần, thì việc bật một công cụ phụ thuộc mới sẽ không tải lại gói đó.

Mỗi công cụ AI yêu cầu một hoặc nhiều gói tính năng trước khi có thể chạy. Giao diện quản trị cài đặt theo công cụ thông qua `POST /api/v1/admin/tools/:toolId/features/install`, giao diện này giải quyết toàn bộ danh sách gói, bỏ qua những gói đã cài và chỉ xếp hàng những phần tải còn thiếu. Ví dụ, bật Passport Photo trên một phiên bản mới sẽ xếp hàng `background-removal` và `face-detection`; bật nó sau khi Background Removal đã được cài thì chỉ xếp hàng `face-detection`.

| Gói | Kích thước | Nhóm phụ thuộc dùng chung | Công cụ sử dụng |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | matting nền rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | phát hiện khuôn mặt và mốc điểm MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting LaMa và DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, khử nhiễu | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | quy trình sửa vết xước và phục chế | restore-photo |
| `ocr` | 5-6 GB | ngăn xếp OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 MB | mô hình chuyển giọng nói thành văn bản faster-whisper | transcribe-audio, auto-subtitles |

Các công cụ có phụ thuộc chéo giữa nhiều gói:

| Công cụ | Gói yêu cầu | Lý do |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Xóa nền, rồi dùng mốc điểm khuôn mặt để căn khung cắt theo quy tắc ảnh hộ chiếu và ảnh thẻ. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Phát hiện khuôn mặt trước khi chạy tăng cường GFPGAN hoặc CodeFormer trên các vùng khuôn mặt đã chọn. |

Một công cụ chỉ khả dụng khi tất cả gói yêu cầu của nó đã được cài. Cài đặt một phần là hợp lệ và được xử lý tăng dần: các gói đã cài được tái sử dụng, các gói còn thiếu hiển thị dưới dạng cần tải, và các lượt cài đã xếp hàng chạy lần lượt từng lượt để môi trường Python dùng chung không bị sửa đổi đồng thời.

---

## Xóa nền {#background-removal}

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
| `shadowEnabled` | boolean | - | Bật đổ bóng lên chủ thể |
| `shadowOpacity` | number (0-100) | - | Độ mờ đục của bóng |
| `outputFormat` | string | - | Định dạng đầu ra: `png`, `webp` hoặc `avif` |
| `edgeRefine` | integer (0-3) | - | Mức độ tinh chỉnh cạnh |
| `decontaminate` | boolean | - | Loại bỏ lem màu ở cạnh |

## Thay nền {#background-replace}

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

## Làm mờ nền {#blur-background}

**Đường dẫn công cụ:** `blur-background`  
**Mô hình:** rembg / BiRefNet (dùng chung với remove-background)

Làm mờ nền trong khi giữ chủ thể sắc nét.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Cường độ làm mờ |
| `feather` | integer (0-20) | `0` | Bán kính làm mềm cạnh |
| `format` | `"png"` \| `"webp"` | `"png"` | Định dạng đầu ra |

## Upscale ảnh {#image-upscaling}

**Đường dẫn công cụ:** `upscale`  
**Mô hình:** RealESRGAN (dự phòng Lanczos khi không có sẵn)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Hệ số upscale |
| `model` | string | `"auto"` | Biến thể mô hình |
| `faceEnhance` | boolean | `false` | Áp dụng lượt tăng cường khuôn mặt GFPGAN |
| `denoise` | number | `0` | Cường độ khử nhiễu |
| `format` | string | `"auto"` | Ghi đè định dạng đầu ra |
| `quality` | number | `95` | Chất lượng đầu ra (1-100) |

## OCR / Trích xuất văn bản {#ocr-text-extraction}

**Đường dẫn công cụ:** `ocr`  
**Mô hình:** Tesseract (nhanh), PaddleOCR PP-OCRv5 (cân bằng), PaddleOCR-VL 1.5 (tốt nhất)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Bậc xử lý |
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Tiền xử lý ảnh để cải thiện độ chính xác OCR |
| `engine` | string | - | Không dùng nữa. Ánh xạ `tesseract` sang `fast`, `paddleocr` sang `balanced` |

Trả về kết quả có cấu trúc với hộp giới hạn, điểm tin cậy và các khối văn bản đã trích xuất.

## OCR PDF {#pdf-ocr}

**Đường dẫn công cụ:** `ocr-pdf`  
**Mô hình:** Cùng hệ thống bậc như OCR ảnh

Trích xuất văn bản từ tài liệu PDF đã quét bằng OCR chạy trên AI, theo từng trang.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Bậc xử lý |
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Chọn trang: `"all"`, `"1-3"`, `"1,3,5"` |

## Làm mờ khuôn mặt / PII {#face-pii-blur}

**Đường dẫn công cụ:** `blur-faces`  
**Mô hình:** phát hiện khuôn mặt MediaPipe

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Bán kính làm mờ Gaussian |
| `sensitivity` | number (0-1) | `0.5` | Ngưỡng tin cậy phát hiện |

## Tăng cường khuôn mặt {#face-enhancement}

**Đường dẫn công cụ:** `enhance-faces`  
**Mô hình:** GFPGAN, CodeFormer

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Mô hình tăng cường |
| `strength` | number (0-1) | `0.8` | Cường độ tăng cường |
| `sensitivity` | number (0-1) | `0.5` | Ngưỡng phát hiện khuôn mặt |
| `onlyCenterFace` | boolean | `false` | Chỉ tăng cường khuôn mặt ở trung tâm nhất |

## Tô màu bằng AI {#ai-colorization}

**Đường dẫn công cụ:** `colorize`  
**Mô hình:** DDColor (dự phòng OpenCV DNN)

Chuyển ảnh đen trắng hoặc thang xám thành ảnh màu đầy đủ.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Cường độ bão hòa màu |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Biến thể mô hình |

## Khử nhiễu {#noise-removal}

**Đường dẫn công cụ:** `noise-removal`  
**Mô hình:** SCUNet (quy trình khử nhiễu phân bậc)

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Bậc xử lý |
| `strength` | number (0-100) | `50` | Cường độ khử nhiễu |
| `detailPreservation` | number (0-100) | `50` | Mức chi tiết cần giữ lại; cao hơn thì giữ nhiều kết cấu hơn |
| `colorNoise` | number (0-100) | `30` | Cường độ giảm nhiễu màu |
| `format` | string | `"original"` | Định dạng đầu ra: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Chất lượng mã hóa đầu ra |

## Xóa mắt đỏ {#red-eye-removal}

**Đường dẫn công cụ:** `red-eye-removal`

Phát hiện mốc điểm khuôn mặt, xác định vùng mắt và chỉnh việc kênh đỏ bị bão hòa quá mức.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Ngưỡng phát hiện điểm ảnh đỏ |
| `strength` | number (0-100) | `70` | Cường độ chỉnh sửa |
| `format` | string | - | Ghi đè định dạng đầu ra (tùy chọn) |
| `quality` | number (1-100) | `90` | Chất lượng đầu ra |

## Phục chế ảnh {#photo-restoration}

**Đường dẫn công cụ:** `restore-photo`

Quy trình nhiều bước cho ảnh cũ hoặc hư hỏng: phát hiện và sửa vết xước/rách, tăng cường khuôn mặt, khử nhiễu và tô màu tùy chọn.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Phát hiện và sửa vết xước, vết rách |
| `faceEnhancement` | boolean | `true` | Áp dụng lượt tăng cường khuôn mặt |
| `fidelity` | number (0-1) | `0.7` | Cường độ tăng cường khuôn mặt (cao hơn = thận trọng hơn) |
| `denoise` | boolean | `true` | Áp dụng lượt khử nhiễu |
| `denoiseStrength` | number (0-100) | `25` | Cường độ khử nhiễu |
| `colorize` | boolean | `false` | Tô màu sau khi phục chế |
| `colorizeStrength` | number (0-100) | `85` | Cường độ tô màu |

## Ảnh hộ chiếu {#passport-photo}

**Đường dẫn công cụ:** `passport-photo`  
**Mô hình:** mốc điểm khuôn mặt MediaPipe + xóa nền BiRefNet

Quy trình hai giai đoạn: phân tích (phát hiện khuôn mặt + xóa nền) rồi tạo (cắt, đổi kích thước, xếp lưới). Hỗ trợ hơn 37 quốc gia trên 6 khu vực.

### Giai đoạn 1: Phân tích {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Nhận một tệp ảnh (multipart). Trả về dữ liệu mốc điểm khuôn mặt, bản xem trước base64 và kích thước ảnh.

### Giai đoạn 2: Tạo {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Nhận một body JSON gồm kết quả Giai đoạn 1 cộng với các thiết lập tạo:

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `jobId` | string | (bắt buộc) | ID công việc từ Giai đoạn 1 |
| `filename` | string | (bắt buộc) | Tên tệp gốc từ Giai đoạn 1 |
| `countryCode` | string | (bắt buộc) | Mã quốc gia ISO (ví dụ `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Loại giấy tờ |
| `bgColor` | string | `"#FFFFFF"` | Mã hex màu nền |
| `printLayout` | string | `"none"` | Bố cục in: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Kích thước tệp tối đa tính bằng KB (0 = không giới hạn) |
| `dpi` | number (72-1200) | `300` | DPI đầu ra |
| `customWidthMm` | number | - | Chiều rộng tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| `customHeightMm` | number | - | Chiều cao tùy chỉnh tính bằng mm (ghi đè thông số quốc gia) |
| `zoom` | number (0.5-3) | `1` | Hệ số thu phóng |
| `adjustX` | number | `0` | Điều chỉnh vị trí ngang |
| `adjustY` | number | `0` | Điều chỉnh vị trí dọc |
| `landmarks` | object | (bắt buộc) | Mốc điểm từ Giai đoạn 1 |
| `imageWidth` | number | (bắt buộc) | Chiều rộng ảnh từ Giai đoạn 1 |
| `imageHeight` | number | (bắt buộc) | Chiều cao ảnh từ Giai đoạn 1 |

## Xóa vật thể (Inpainting) {#object-erasing-inpainting}

**Đường dẫn công cụ:** `erase-object`  
**Mô hình:** LaMa qua ONNX Runtime

Mask được gửi dưới dạng **phần tệp thứ hai** (tên trường `mask`), không phải base64. Điểm ảnh trắng trong mask cho biết vùng cần xóa. Các thiết lập `format` và `quality` được gửi dưới dạng trường form cấp trên cùng.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `file` | file | (bắt buộc) | Ảnh nguồn (multipart) |
| `mask` | file | (bắt buộc) | Ảnh mask (multipart, tên trường `mask`, trắng = xóa) |
| `format` | string | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Chất lượng đầu ra |

Tăng tốc CUDA khi có GPU NVIDIA.

## Mở rộng khung ảnh bằng AI {#ai-canvas-expand}

**Đường dẫn công cụ:** `ai-canvas-expand`  
**Mô hình:** outpainting dựa trên LaMa

Mở rộng khung của một ảnh theo bất kỳ hướng nào và điền vào các vùng mới bằng nội dung do AI tạo ra khớp với ảnh hiện có.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Số điểm ảnh mở rộng ở phía trên |
| `extendRight` | integer | `0` | Số điểm ảnh mở rộng ở phía phải |
| `extendBottom` | integer | `0` | Số điểm ảnh mở rộng ở phía dưới |
| `extendLeft` | integer | `0` | Số điểm ảnh mở rộng ở phía trái |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Bậc chất lượng |
| `format` | string | `"auto"` | Định dạng đầu ra: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Chất lượng đầu ra |

Ít nhất một hướng mở rộng phải lớn hơn 0.

## Cắt thông minh {#smart-crop}

**Đường dẫn công cụ:** `smart-crop`  
**Mô hình:** phát hiện khuôn mặt MediaPipe (chỉ ở chế độ khuôn mặt)

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
| `padColor` | string | `"#ffffff"` | Màu nền cho phần đệm vuông |
| `targetSize` | integer | - | Kích thước đích cho đầu ra đã đệm (điểm ảnh) |
| `quality` | integer (1-100) | - | Chất lượng đầu ra |

Các giá trị `mode` cũ `attention` và `content` vẫn được chấp nhận và ánh xạ lần lượt sang `subject` và `trim`.

**Khung định sẵn cho khuôn mặt:**

| Định sẵn | Phù hợp nhất cho |
|--------|---------|
| `closeup` | Ảnh chân dung cận |
| `head-shoulders` | Ảnh hồ sơ |
| `upper-body` | LinkedIn / trang trọng |
| `half-body` | Toàn bộ nửa thân trên |

## Chuyển âm thanh thành văn bản {#transcribe-audio}

**Đường dẫn công cụ:** `transcribe-audio`  
**Mô hình:** faster-whisper

Chuyển giọng nói thành văn bản. Hỗ trợ định dạng đầu ra văn bản thuần, SRT và VTT.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Định dạng đầu ra |

## Phụ đề tự động {#auto-subtitles}

**Đường dẫn công cụ:** `auto-subtitles`  
**Mô hình:** faster-whisper (trích âm thanh từ video, rồi chuyển thành văn bản)

Tạo tệp phụ đề từ track âm thanh của video.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Ngôn ngữ: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Định dạng phụ đề đầu ra |

## Sửa độ trong suốt PNG {#png-transparency-fixer}

**Đường dẫn công cụ:** `transparency-fixer`  
**Mô hình:** BiRefNet HR-matting (độ phân giải 2048x2048)

Sửa các PNG "trong suốt giả", nơi nền đã được xóa nhưng để lại viền tua, quầng sáng hoặc phần dư bán trong suốt. Dùng mô hình matting độ phân giải cao của BiRefNet để tạo kênh alpha sạch, rồi áp dụng xử lý khử viền có thể cấu hình để loại bỏ nhiễm màu dọc theo cạnh.

**Chuỗi dự phòng khi hết bộ nhớ:** Nếu BiRefNet HR-matting vượt quá bộ nhớ khả dụng, công cụ tự động chuyển sang dự phòng `birefnet-general`, rồi đến `u2net`.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Cường độ khử viền để loại bỏ nhiễm màu ở cạnh |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Định dạng ảnh đầu ra |
| `removeWatermark` | boolean | `false` | Áp dụng tiền xử lý xóa hình mờ (bộ lọc trung vị) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Công cụ có khả năng AI tùy chọn {#tools-with-optional-ai-capabilities}

Các công cụ sau không phải công cụ sidecar Python nhưng dùng tính năng AI khi bật một số tùy chọn.

### Tăng cường ảnh {#image-enhancement}

**Đường dẫn công cụ:** `image-enhancement`  
**Engine:** Dựa trên phân tích (biểu đồ histogram và thống kê Sharp)

Phân tích ảnh và áp dụng chỉnh sửa tự động cho phơi sáng, tương phản, cân bằng trắng, độ bão hòa, độ nét và nhiễu. Hỗ trợ các chế độ theo cảnh cụ thể.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Chế độ cảnh để tinh chỉnh việc chỉnh sửa |
| `intensity` | number (0-100) | `50` | Cường độ chỉnh sửa tổng thể |
| `corrections.exposure` | boolean | `true` | Áp dụng chỉnh phơi sáng |
| `corrections.contrast` | boolean | `true` | Áp dụng chỉnh tương phản |
| `corrections.whiteBalance` | boolean | `true` | Áp dụng chỉnh cân bằng trắng |
| `corrections.saturation` | boolean | `true` | Áp dụng chỉnh độ bão hòa |
| `corrections.sharpness` | boolean | `true` | Áp dụng chỉnh độ nét |
| `corrections.denoise` | boolean | `true` | Áp dụng khử nhiễu |
| `deepEnhance` | boolean | `false` | Bật khử nhiễu AI qua SCUNet (yêu cầu gói `upscale-enhance`) |

Một endpoint phân tích bổ sung có tại `POST /api/v1/tools/image/image-enhancement/analyze`, trả về các chỉnh sửa được phát hiện mà không áp dụng chúng.

### Đổi kích thước theo nội dung (Seam Carving) {#content-aware-resize-seam-carving}

**Đường dẫn công cụ:** `content-aware-resize`  
**Engine:** binary Go `caire` (không phải Python, không hưởng lợi từ GPU)

Đổi kích thước ảnh một cách thông minh bằng cách loại bỏ các đường nối năng lượng thấp, giữ lại nội dung quan trọng.

| Tham số | Kiểu | Mặc định | Mô tả |
|-----------|------|---------|-------------|
| `width` | number | - | Chiều rộng đích |
| `height` | number | - | Chiều cao đích |
| `protectFaces` | boolean | `false` | Bảo vệ vùng khuôn mặt đã phát hiện (yêu cầu gói `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Làm mờ trước để tính năng lượng |
| `sobelThreshold` | number (1-20) | `2` | Ngưỡng độ nhạy cạnh |
| `square` | boolean | `false` | Buộc đầu ra vuông |
