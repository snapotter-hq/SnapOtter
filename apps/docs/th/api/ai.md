---
description: "เอกสารอ้างอิงเอนจิน AI พร้อมเครื่องมือ ML ที่ทำงานในเครื่องทั้งหมด การลบพื้นหลัง การขยายภาพ OCR การตรวจจับใบหน้า การกู้คืนภาพถ่าย และอื่น ๆ"
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 8818c2718237
---

# เอกสารอ้างอิงเอนจิน AI {#ai-engine-reference}

แพ็กเกจ `@snapotter/ai` เชื่อม Node.js เข้ากับ **Python sidecar แบบถาวร** สำหรับการทำงาน ML ทั้งหมด กระบวนการ dispatcher จะยังทำงานอยู่ระหว่างคำขอเพื่อประสิทธิภาพ warm-start ที่รวดเร็ว NVIDIA CUDA จะถูกตรวจจับอัตโนมัติตอนเริ่มต้นและใช้งานเมื่อพร้อมใช้ได้ มิฉะนั้นเครื่องมือ AI จะทำงานบน CPU

การเร่งความเร็วด้วย iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในตอนนี้ การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เร่งความเร็วเครื่องมือ Python sidecar เหล่านี้ เว้นแต่จะมี GPU NVIDIA ที่รองรับ CUDA พร้อมใช้งาน

เครื่องมือ AI แบบ Python sidecar 19 รายการครอบคลุมสี่รูปแบบ (image, audio, video, document) รวมทั้งเครื่องมืออีก 2 รายการที่มีความสามารถ AI แบบเสริม โมเดลทั้งหมดทำงานในเครื่อง ไม่ต้องใช้อินเทอร์เน็ตหลังจากดาวน์โหลดโมเดลครั้งแรก

## สถาปัตยกรรม {#architecture}

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

โปรไฟล์ dispatcher แบบ "docs" ที่แยกออกมาจะแทนที่ allowlist ของ AI ด้วยสคริปต์ประมวลผลเอกสาร (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) และข้ามการนำเข้า ML ขนาดใหญ่

**Timeouts:** ค่าเริ่มต้น 300 วินาที OCR และการลบพื้นหลังด้วย BiRefNet ได้ 600 วินาที

## ชุดฟีเจอร์ {#feature-bundles}

เครื่องมือ AI แต่ละตัวต้องติดตั้งชุดโมเดลก่อนใช้งาน ชุดต่าง ๆ จะถูกติดตั้งเมื่อต้องใช้ผ่าน UI ผู้ดูแลระบบหรือ `install_feature.py`

| ชุด | ขนาด | เครื่องมือ |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## การลบพื้นหลัง {#background-removal}

**เส้นทางเครื่องมือ:** `remove-background`  
**โมเดล:** rembg พร้อม BiRefNet (ค่าเริ่มต้น) หรือรูปแบบต่าง ๆ ของ U2-Net

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `model` | string | - | รูปแบบโมเดล (การแทนที่แบบเสริม) |
| `backgroundType` | string | `"transparent"` | หนึ่งใน: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | สีแบบ Hex สำหรับพื้นหลังสีทึบ |
| `gradientColor1` | string | - | สีไล่ระดับสีที่หนึ่ง |
| `gradientColor2` | string | - | สีไล่ระดับสีที่สอง |
| `gradientAngle` | number | - | มุมไล่ระดับสีเป็นองศา |
| `blurEnabled` | boolean | - | เปิดใช้เอฟเฟกต์เบลอพื้นหลัง |
| `blurIntensity` | number (0-100) | - | ความเข้มของการเบลอ |
| `shadowEnabled` | boolean | - | เปิดใช้เงาตกกระทบบนวัตถุ |
| `shadowOpacity` | number (0-100) | - | ความทึบของเงา |
| `outputFormat` | string | - | รูปแบบผลลัพธ์: `png`, `webp` หรือ `avif` |
| `edgeRefine` | integer (0-3) | - | ระดับการปรับแต่งขอบ |
| `decontaminate` | boolean | - | ลบสีที่ซึมออกจากขอบ |

## การแทนที่พื้นหลัง {#background-replace}

**เส้นทางเครื่องมือ:** `background-replace`  
**โมเดล:** rembg / BiRefNet (ใช้ร่วมกับ remove-background)

ลบพื้นหลังและแทนที่ด้วยสีทึบหรือสีไล่ระดับ

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | โหมดพื้นหลัง |
| `color` | string | `"#ffffff"` | สี Hex ของพื้นหลัง (เมื่อ `backgroundType` เป็น `color`) |
| `gradientColor1` | string | - | สี Hex ไล่ระดับสีที่หนึ่ง |
| `gradientColor2` | string | - | สี Hex ไล่ระดับสีที่สอง |
| `gradientAngle` | integer (0-360) | `180` | มุมไล่ระดับสีเป็นองศา |
| `feather` | integer (0-20) | `0` | รัศมีการทำขอบให้นุ่ม |
| `format` | `"png"` \| `"webp"` | `"png"` | รูปแบบผลลัพธ์ |

## เบลอพื้นหลัง {#blur-background}

**เส้นทางเครื่องมือ:** `blur-background`  
**โมเดล:** rembg / BiRefNet (ใช้ร่วมกับ remove-background)

เบลอพื้นหลังในขณะที่ยังคงความคมชัดของวัตถุ

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ความเข้มของการเบลอ |
| `feather` | integer (0-20) | `0` | รัศมีการทำขอบให้นุ่ม |
| `format` | `"png"` \| `"webp"` | `"png"` | รูปแบบผลลัพธ์ |

## การขยายภาพ {#image-upscaling}

**เส้นทางเครื่องมือ:** `upscale`  
**โมเดล:** RealESRGAN (พร้อม Lanczos fallback เมื่อไม่พร้อมใช้งาน)

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `scale` | number | `2` | ตัวคูณการขยายภาพ |
| `model` | string | `"auto"` | รูปแบบโมเดล |
| `faceEnhance` | boolean | `false` | ใช้การปรับปรุงใบหน้าด้วย GFPGAN |
| `denoise` | number | `0` | ความเข้มของการลดสัญญาณรบกวน |
| `format` | string | `"auto"` | การแทนที่รูปแบบผลลัพธ์ |
| `quality` | number | `95` | คุณภาพผลลัพธ์ (1-100) |

## OCR / การสกัดข้อความ {#ocr-text-extraction}

**เส้นทางเครื่องมือ:** `ocr`  
**โมเดล:** Tesseract (เร็ว), PaddleOCR PP-OCRv5 (สมดุล), PaddleOCR-VL 1.5 (ดีที่สุด)

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | ระดับการประมวลผล |
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | ประมวลผลภาพล่วงหน้าเพื่อเพิ่มความแม่นยำของ OCR |
| `engine` | string | - | เลิกใช้แล้ว แมป `tesseract` ไปยัง `fast`, `paddleocr` ไปยัง `balanced` |

คืนผลลัพธ์แบบมีโครงสร้างพร้อมกรอบครอบขอบเขต คะแนนความเชื่อมั่น และบล็อกข้อความที่สกัดออกมา

## PDF OCR {#pdf-ocr}

**เส้นทางเครื่องมือ:** `ocr-pdf`  
**โมเดล:** ระบบระดับเดียวกับ OCR ภาพ

สกัดข้อความจากเอกสาร PDF ที่สแกนโดยใช้ OCR ที่ขับเคลื่อนด้วย AI ทีละหน้า

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | ระดับการประมวลผล |
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | การเลือกหน้า: `"all"`, `"1-3"`, `"1,3,5"` |

## เบลอใบหน้า / PII {#face-pii-blur}

**เส้นทางเครื่องมือ:** `blur-faces`  
**โมเดล:** การตรวจจับใบหน้าด้วย MediaPipe

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | รัศมี Gaussian blur |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์ความเชื่อมั่นในการตรวจจับ |

## การปรับปรุงใบหน้า {#face-enhancement}

**เส้นทางเครื่องมือ:** `enhance-faces`  
**โมเดล:** GFPGAN, CodeFormer

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | โมเดลการปรับปรุง |
| `strength` | number (0-1) | `0.8` | ความเข้มของการปรับปรุง |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์การตรวจจับใบหน้า |
| `onlyCenterFace` | boolean | `false` | ปรับปรุงเฉพาะใบหน้าที่อยู่กึ่งกลางที่สุด |

## การลงสีด้วย AI {#ai-colorization}

**เส้นทางเครื่องมือ:** `colorize`  
**โมเดล:** DDColor (พร้อม OpenCV DNN fallback)

แปลงภาพขาวดำหรือภาพโทนสีเทาให้เป็นภาพสีเต็มรูปแบบ

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | ความเข้มของความอิ่มตัวของสี |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | รูปแบบโมเดล |

## การลบสัญญาณรบกวน {#noise-removal}

**เส้นทางเครื่องมือ:** `noise-removal`  
**โมเดล:** SCUNet (ไปป์ไลน์การลดสัญญาณรบกวนแบบหลายระดับ)

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | ระดับการประมวลผล |
| `strength` | number (0-100) | `50` | ความเข้มของการลดสัญญาณรบกวน |
| `detailPreservation` | number (0-100) | `50` | ปริมาณรายละเอียดที่จะรักษาไว้ ค่าสูงจะเก็บพื้นผิวไว้มากขึ้น |
| `colorNoise` | number (0-100) | `30` | ความเข้มของการลดสัญญาณรบกวนสี |
| `format` | string | `"original"` | รูปแบบผลลัพธ์: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | คุณภาพการเข้ารหัสผลลัพธ์ |

## การลบตาแดง {#red-eye-removal}

**เส้นทางเครื่องมือ:** `red-eye-removal`

ตรวจจับจุดสังเกตบนใบหน้า ระบุตำแหน่งบริเวณดวงตา และแก้ไขการอิ่มตัวเกินของช่องสีแดง

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | เกณฑ์การตรวจจับพิกเซลสีแดง |
| `strength` | number (0-100) | `70` | ความเข้มของการแก้ไข |
| `format` | string | - | การแทนที่รูปแบบผลลัพธ์ (เสริม) |
| `quality` | number (1-100) | `90` | คุณภาพผลลัพธ์ |

## การกู้คืนภาพถ่าย {#photo-restoration}

**เส้นทางเครื่องมือ:** `restore-photo`

ไปป์ไลน์หลายขั้นตอนสำหรับภาพถ่ายเก่าหรือเสียหาย: การตรวจจับและซ่อมรอยขีดข่วน/รอยฉีก การปรับปรุงใบหน้า การลดสัญญาณรบกวน และการลงสีแบบเสริม

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | ตรวจจับและซ่อมรอยขีดข่วน รอยฉีก |
| `faceEnhancement` | boolean | `true` | ใช้การปรับปรุงใบหน้า |
| `fidelity` | number (0-1) | `0.7` | ความเข้มของการปรับปรุงใบหน้า (ค่าสูง = ระมัดระวังมากขึ้น) |
| `denoise` | boolean | `true` | ใช้การลดสัญญาณรบกวน |
| `denoiseStrength` | number (0-100) | `25` | ความเข้มของการลดสัญญาณรบกวน |
| `colorize` | boolean | `false` | ลงสีหลังการกู้คืน |
| `colorizeStrength` | number (0-100) | `85` | ความเข้มของการลงสี |

## รูปถ่ายหนังสือเดินทาง {#passport-photo}

**เส้นทางเครื่องมือ:** `passport-photo`  
**โมเดล:** จุดสังเกตบนใบหน้า MediaPipe + การลบพื้นหลัง BiRefNet

ขั้นตอนการทำงานสองเฟส: วิเคราะห์ (ตรวจจับใบหน้า + ลบพื้นหลัง) จากนั้นสร้าง (ครอบตัด ปรับขนาด เรียงเป็นแผ่น) รองรับกว่า 37 ประเทศใน 6 ภูมิภาค

### เฟส 1: วิเคราะห์ {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

รับไฟล์ภาพ (multipart) คืนข้อมูลจุดสังเกตบนใบหน้า ตัวอย่างแบบ base64 และมิติของภาพ

### เฟส 2: สร้าง {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

รับ JSON body พร้อมผลลัพธ์จากเฟส 1 บวกกับการตั้งค่าการสร้าง:

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `jobId` | string | (จำเป็น) | Job ID จากเฟส 1 |
| `filename` | string | (จำเป็น) | ชื่อไฟล์ต้นฉบับจากเฟส 1 |
| `countryCode` | string | (จำเป็น) | รหัสประเทศ ISO (เช่น `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | ประเภทเอกสาร |
| `bgColor` | string | `"#FFFFFF"` | สี Hex ของพื้นหลัง |
| `printLayout` | string | `"none"` | เลย์เอาต์การพิมพ์: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | ขนาดไฟล์สูงสุดเป็น KB (0 = ไม่จำกัด) |
| `dpi` | number (72-1200) | `300` | DPI ของผลลัพธ์ |
| `customWidthMm` | number | - | ความกว้างกำหนดเองเป็น mm (แทนที่ข้อกำหนดของประเทศ) |
| `customHeightMm` | number | - | ความสูงกำหนดเองเป็น mm (แทนที่ข้อกำหนดของประเทศ) |
| `zoom` | number (0.5-3) | `1` | ตัวคูณการซูม |
| `adjustX` | number | `0` | การปรับตำแหน่งแนวนอน |
| `adjustY` | number | `0` | การปรับตำแหน่งแนวตั้ง |
| `landmarks` | object | (จำเป็น) | จุดสังเกตจากเฟส 1 |
| `imageWidth` | number | (จำเป็น) | ความกว้างของภาพจากเฟส 1 |
| `imageHeight` | number | (จำเป็น) | ความสูงของภาพจากเฟส 1 |

## การลบวัตถุ (Inpainting) {#object-erasing-inpainting}

**เส้นทางเครื่องมือ:** `erase-object`  
**โมเดล:** LaMa ผ่าน ONNX Runtime

มาสก์จะถูกส่งเป็น **ไฟล์พาร์ตที่สอง** (ชื่อฟิลด์ `mask`) ไม่ใช่เป็น base64 พิกเซลสีขาวในมาสก์บ่งชี้พื้นที่ที่จะลบ การตั้งค่า `format` และ `quality` จะถูกส่งเป็นฟิลด์ฟอร์มระดับบนสุด

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `file` | file | (จำเป็น) | ภาพต้นฉบับ (multipart) |
| `mask` | file | (จำเป็น) | ภาพมาสก์ (multipart ชื่อฟิลด์ `mask` สีขาว = ลบ) |
| `format` | string | `"auto"` | รูปแบบผลลัพธ์: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | คุณภาพผลลัพธ์ |

เร่งความเร็วด้วย CUDA เมื่อมี GPU NVIDIA พร้อมใช้งาน

## การขยายผืนผ้าใบด้วย AI {#ai-canvas-expand}

**เส้นทางเครื่องมือ:** `ai-canvas-expand`  
**โมเดล:** การ outpainting ที่ใช้ LaMa

ขยายผืนผ้าใบของภาพในทิศทางใดก็ได้และเติมพื้นที่ใหม่ด้วยเนื้อหาที่สร้างโดย AI ให้เข้ากับภาพที่มีอยู่

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | พิกเซลที่จะขยายด้านบน |
| `extendRight` | integer | `0` | พิกเซลที่จะขยายด้านขวา |
| `extendBottom` | integer | `0` | พิกเซลที่จะขยายด้านล่าง |
| `extendLeft` | integer | `0` | พิกเซลที่จะขยายด้านซ้าย |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | ระดับคุณภาพ |
| `format` | string | `"auto"` | รูปแบบผลลัพธ์: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | คุณภาพผลลัพธ์ |

อย่างน้อยหนึ่งทิศทางการขยายต้องมากกว่า 0

## Smart Crop {#smart-crop}

**เส้นทางเครื่องมือ:** `smart-crop`  
**โมเดล:** การตรวจจับใบหน้าด้วย MediaPipe (โหมดใบหน้าเท่านั้น)

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | กลยุทธ์การครอบตัด: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | กลยุทธ์สำหรับโหมดวัตถุ |
| `width` | integer | - | ความกว้างผลลัพธ์ |
| `height` | integer | - | ความสูงผลลัพธ์ |
| `padding` | integer (0-50) | `0` | เปอร์เซ็นต์ระยะขอบรอบวัตถุ |
| `facePreset` | string | `"head-shoulders"` | การจัดเฟรมสำเร็จรูปเมื่อ `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์การตรวจจับใบหน้า |
| `threshold` | integer (0-255) | `30` | เกณฑ์การตรวจจับพื้นหลัง (โหมด trim) |
| `padToSquare` | boolean | `false` | เติมผลลัพธ์ที่ตัดขอบให้เป็นสี่เหลี่ยมจัตุรัส |
| `padColor` | string | `"#ffffff"` | สีพื้นหลังสำหรับการเติมให้เป็นสี่เหลี่ยมจัตุรัส |
| `targetSize` | integer | - | ขนาดเป้าหมายสำหรับผลลัพธ์ที่เติม (พิกเซล) |
| `quality` | integer (1-100) | - | คุณภาพผลลัพธ์ |

ค่า `mode` แบบเดิม `attention` และ `content` ยังคงรับได้และแมปไปยัง `subject` และ `trim` ตามลำดับ

**พรีเซ็ตใบหน้า:**

| พรีเซ็ต | เหมาะสำหรับ |
|--------|---------|
| `closeup` | ภาพถ่ายศีรษะ |
| `head-shoulders` | รูปโปรไฟล์ |
| `upper-body` | LinkedIn / เป็นทางการ |
| `half-body` | ช่วงบนของร่างกายเต็ม |

## ถอดเสียงเป็นข้อความ {#transcribe-audio}

**เส้นทางเครื่องมือ:** `transcribe-audio`  
**โมเดล:** faster-whisper

แปลงคำพูดเป็นข้อความ รองรับรูปแบบผลลัพธ์แบบข้อความล้วน SRT และ VTT

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | รูปแบบผลลัพธ์ |

## คำบรรยายอัตโนมัติ {#auto-subtitles}

**เส้นทางเครื่องมือ:** `auto-subtitles`  
**โมเดล:** faster-whisper (สกัดเสียงจากวิดีโอ จากนั้นถอดเสียง)

สร้างไฟล์คำบรรยายจากแทร็กเสียงของวิดีโอ

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | รูปแบบคำบรรยายผลลัพธ์ |

## ตัวแก้ไขความโปร่งใส PNG {#png-transparency-fixer}

**เส้นทางเครื่องมือ:** `transparency-fixer`  
**โมเดล:** BiRefNet HR-matting (ความละเอียด 2048x2048)

แก้ไข PNG แบบ "โปร่งใสปลอม" ที่พื้นหลังถูกลบออกแต่ทิ้งขอบเปื้อน รัศมี หรือสิ่งแปลกปลอมกึ่งโปร่งใสไว้ ใช้โมเดล matting ความละเอียดสูงของ BiRefNet เพื่อสร้างช่องอัลฟาที่สะอาด จากนั้นใช้การประมวลผล defringe ที่ปรับได้เพื่อลบการปนเปื้อนสีตามขอบ

**ลูกโซ่ fallback เมื่อ OOM:** หาก BiRefNet HR-matting ใช้หน่วยความจำเกินที่มี เครื่องมือจะ fallback อัตโนมัติไปที่ `birefnet-general` จากนั้นไปที่ `u2net`

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | ความเข้มของการ defringe ขอบเพื่อลบการปนเปื้อนสี |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | รูปแบบภาพผลลัพธ์ |
| `removeWatermark` | boolean | `false` | ใช้การประมวลผลล่วงหน้าเพื่อลบลายน้ำ (median filter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## เครื่องมือที่มีความสามารถ AI แบบเสริม {#tools-with-optional-ai-capabilities}

เครื่องมือต่อไปนี้ไม่ใช่เครื่องมือ Python sidecar แต่ใช้ฟีเจอร์ AI เมื่อเปิดใช้ตัวเลือกบางอย่าง

### การปรับปรุงภาพ {#image-enhancement}

**เส้นทางเครื่องมือ:** `image-enhancement`  
**เอนจิน:** อิงการวิเคราะห์ (ฮิสโทแกรมและสถิติของ Sharp)

วิเคราะห์ภาพและใช้การแก้ไขอัตโนมัติสำหรับการรับแสง คอนทราสต์ สมดุลแสงขาว ความอิ่มตัวของสี ความคมชัด และสัญญาณรบกวน รองรับโหมดเฉพาะฉาก

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | โหมดฉากสำหรับปรับจูนการแก้ไข |
| `intensity` | number (0-100) | `50` | ความเข้มของการแก้ไขโดยรวม |
| `corrections.exposure` | boolean | `true` | ใช้การแก้ไขการรับแสง |
| `corrections.contrast` | boolean | `true` | ใช้การแก้ไขคอนทราสต์ |
| `corrections.whiteBalance` | boolean | `true` | ใช้การแก้ไขสมดุลแสงขาว |
| `corrections.saturation` | boolean | `true` | ใช้การแก้ไขความอิ่มตัวของสี |
| `corrections.sharpness` | boolean | `true` | ใช้การแก้ไขความคมชัด |
| `corrections.denoise` | boolean | `true` | ใช้การลดสัญญาณรบกวน |
| `deepEnhance` | boolean | `false` | เปิดใช้การลบสัญญาณรบกวนด้วย AI ผ่าน SCUNet (ต้องใช้ชุด `upscale-enhance`) |

มีเอนด์พอยต์การวิเคราะห์เพิ่มเติมที่ `POST /api/v1/tools/image/image-enhancement/analyze` ซึ่งคืนการแก้ไขที่ตรวจพบโดยไม่นำไปใช้จริง

### การปรับขนาดแบบรู้เนื้อหา (Seam Carving) {#content-aware-resize-seam-carving}

**เส้นทางเครื่องมือ:** `content-aware-resize`  
**เอนจิน:** ไบนารี Go `caire` (ไม่ใช่ Python ไม่ได้ประโยชน์จาก GPU)

ปรับขนาดภาพอย่างชาญฉลาดโดยลบ seam ที่มีพลังงานต่ำ รักษาเนื้อหาสำคัญไว้

| พารามิเตอร์ | ชนิด | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `width` | number | - | ความกว้างเป้าหมาย |
| `height` | number | - | ความสูงเป้าหมาย |
| `protectFaces` | boolean | `false` | ปกป้องบริเวณใบหน้าที่ตรวจพบ (ต้องใช้ชุด `face-detection`) |
| `blurRadius` | number (0-20) | `4` | การเบลอล่วงหน้าสำหรับการคำนวณพลังงาน |
| `sobelThreshold` | number (1-20) | `2` | เกณฑ์ความไวของขอบ |
| `square` | boolean | `false` | บังคับผลลัพธ์เป็นสี่เหลี่ยมจัตุรัส |
