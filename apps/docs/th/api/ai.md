---
description: "เอกสารอ้างอิงเอนจิน AI พร้อมเครื่องมือ ML ในเครื่องทั้งหมด การลบพื้นหลัง การขยายภาพ OCR การตรวจจับใบหน้า การกู้คืนภาพถ่าย และอื่น ๆ"
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 76c10fa3ca33
---

# เอกสารอ้างอิงเอนจิน AI {#ai-engine-reference}

แพ็กเกจ `@snapotter/ai` เชื่อมโยง Node.js เข้ากับ **Python sidecar แบบถาวร** สำหรับการดำเนินการ ML ทั้งหมด กระบวนการ dispatcher จะคงอยู่ระหว่างคำขอเพื่อประสิทธิภาพการเริ่มต้นแบบ warm-start ที่รวดเร็ว NVIDIA CUDA จะถูกตรวจจับโดยอัตโนมัติเมื่อเริ่มต้นและใช้งานเมื่อพร้อมใช้งาน มิฉะนั้นเครื่องมือ AI จะทำงานบน CPU

การเร่งความเร็ว iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน การแมป `/dev/dri` เข้าไปในคอนเทนเนอร์ไม่ได้เร่งความเร็วเครื่องมือ Python sidecar เหล่านี้ เว้นแต่จะมี NVIDIA GPU ที่รองรับ CUDA พร้อมใช้งาน

เครื่องมือ AI แบบ Python sidecar จำนวน 19 รายการครอบคลุมสี่โมดาลิตี (ภาพ เสียง วิดีโอ เอกสาร) พร้อมด้วยเครื่องมืออีก 2 รายการที่มีความสามารถ AI เสริม โมเดลทั้งหมดทำงานในเครื่อง ไม่ต้องใช้อินเทอร์เน็ตหลังจากดาวน์โหลดโมเดลครั้งแรก

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

โปรไฟล์ dispatcher แบบ "docs" ที่แยกต่างหากจะแทนที่รายการอนุญาต AI ด้วยสคริปต์ประมวลผลเอกสาร (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) และข้ามการอิมพอร์ต ML ขนาดใหญ่

**เวลาหมดเวลา:** ค่าเริ่มต้น 300 วินาที OCR และการลบพื้นหลัง BiRefNet ได้ 600 วินาที

## ชุดฟีเจอร์ (Feature Bundles) {#feature-bundles}

โมเดล AI ถูกจัดแพ็กเกจตามชุด dependency ที่ใช้ร่วมกัน ไม่ใช่หนึ่งไฟล์เก็บถาวรต่อหนึ่งเครื่องมือ ชุดฟีเจอร์หนึ่งชุดสามารถเปิดใช้งานเครื่องมือได้หลายรายการเมื่อเครื่องมือเหล่านั้นใช้ตระกูลโมเดล, Python wheel หรือไลบรารีเนทีฟเดียวกัน วิธีนี้ทำให้ Docker image สำหรับรีลีสมีขนาดเล็กลงและหลีกเลี่ยงการเก็บสำเนาซ้ำของโมเดล background matting, การตรวจจับใบหน้า, OCR, การกู้คืน และโมเดลเสียงพูดเดียวกัน

Docker image มาพร้อมกับแอปพลิเคชันบวกกับรันไทม์ทั่วไป ไฟล์เก็บถาวรของโมเดลขนาดใหญ่จะถูกดาวน์โหลดตามความต้องการลงในโวลุ่ม `/data/ai` แบบถาวร แล้วนำกลับมาใช้ซ้ำโดยทุกเครื่องมือที่ต้องการ หากติดตั้งชุดฟีเจอร์แล้วเนื่องจากมีเครื่องมืออื่นต้องการใช้ การเปิดใช้งานเครื่องมือใหม่ที่ต้องพึ่งพาชุดนั้นจะไม่ดาวน์โหลดชุดฟีเจอร์นั้นซ้ำอีก

เครื่องมือ AI แต่ละรายการต้องมีชุดฟีเจอร์ตั้งแต่หนึ่งชุดขึ้นไปก่อนจึงจะทำงานได้ UI ของผู้ดูแลระบบติดตั้งตามเครื่องมือผ่าน `POST /api/v1/admin/tools/:toolId/features/install` ซึ่งจะแยกรายการชุดฟีเจอร์ทั้งหมด ข้ามชุดที่ติดตั้งแล้ว และจัดคิวเฉพาะการดาวน์โหลดที่ขาดหายไปเท่านั้น ตัวอย่างเช่น การเปิดใช้งาน Passport Photo บนอินสแตนซ์ใหม่จะจัดคิว `background-removal` และ `face-detection` แต่การเปิดใช้งานหลังจากติดตั้ง Background Removal แล้วจะจัดคิวเฉพาะ `face-detection` เท่านั้น

| ชุดฟีเจอร์ | ขนาด | กลุ่ม dependency ที่ใช้ร่วมกัน | เครื่องมือที่ใช้ |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet background matting | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | การตรวจจับใบหน้าและจุดสังเกต MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa inpainting/outpainting และ DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, denoising | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | ไปป์ไลน์ซ่อมรอยขีดข่วนและกู้คืน | restore-photo |
| `ocr` | 5-6 GB | สแตก PaddleOCR / Tesseract OCR | ocr, ocr-pdf |
| `transcription` | ~600 MB | โมเดลแปลงเสียงเป็นข้อความ faster-whisper | transcribe-audio, auto-subtitles |

เครื่องมือที่มี dependency ข้ามชุดฟีเจอร์:

| เครื่องมือ | ชุดฟีเจอร์ที่ต้องใช้ | เหตุผล |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | ลบพื้นหลัง แล้วใช้จุดสังเกตใบหน้าจัดกรอบการครอปให้เป็นไปตามกฎของรูปหนังสือเดินทางและรูปบัตรประจำตัว |
| `enhance-faces` | `upscale-enhance`, `face-detection` | ตรวจจับใบหน้าก่อนรันการปรับปรุงด้วย GFPGAN หรือ CodeFormer บนบริเวณใบหน้าที่เลือก |

เครื่องมือจะพร้อมใช้งานเฉพาะเมื่อติดตั้งชุดฟีเจอร์ที่จำเป็นครบทุกชุดแล้ว การติดตั้งบางส่วนถือว่าใช้ได้และจัดการแบบเพิ่มทีละส่วน ชุดที่ติดตั้งแล้วจะถูกนำกลับมาใช้ซ้ำ ชุดที่ขาดหายไปจะแสดงเป็นการดาวน์โหลด และการติดตั้งที่จัดคิวไว้จะทำงานทีละรายการเพื่อไม่ให้มีการแก้ไขสภาพแวดล้อม Python ที่ใช้ร่วมกันพร้อมกัน

---

## การลบพื้นหลัง {#background-removal}

**เส้นทางเครื่องมือ:** `remove-background`  
**โมเดล:** rembg พร้อม BiRefNet (ค่าเริ่มต้น) หรือรุ่นย่อย U2-Net

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `model` | string | - | รุ่นย่อยของโมเดล (การแทนที่แบบเสริม) |
| `backgroundType` | string | `"transparent"` | หนึ่งใน: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | สีเลขฐานสิบหกสำหรับพื้นหลังสีทึบ |
| `gradientColor1` | string | - | สีไล่ระดับสีแรก |
| `gradientColor2` | string | - | สีไล่ระดับสีที่สอง |
| `gradientAngle` | number | - | มุมไล่ระดับสีเป็นองศา |
| `blurEnabled` | boolean | - | เปิดใช้งานเอฟเฟกต์เบลอพื้นหลัง |
| `blurIntensity` | number (0-100) | - | ความเข้มของการเบลอ |
| `shadowEnabled` | boolean | - | เปิดใช้งานเงาตกกระทบบนวัตถุ |
| `shadowOpacity` | number (0-100) | - | ความทึบของเงา |
| `outputFormat` | string | - | รูปแบบเอาต์พุต: `png`, `webp` หรือ `avif` |
| `edgeRefine` | integer (0-3) | - | ระดับการปรับแต่งขอบ |
| `decontaminate` | boolean | - | ลบสีที่ซึมออกจากขอบ |

## แทนที่พื้นหลัง {#background-replace}

**เส้นทางเครื่องมือ:** `background-replace`  
**โมเดล:** rembg / BiRefNet (ใช้ร่วมกับ remove-background)

ลบพื้นหลังและแทนที่ด้วยสีทึบหรือสีไล่ระดับ

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | โหมดพื้นหลัง |
| `color` | string | `"#ffffff"` | สีเลขฐานสิบหกของพื้นหลัง (เมื่อ `backgroundType` เป็น `color`) |
| `gradientColor1` | string | - | สีเลขฐานสิบหกไล่ระดับสีแรก |
| `gradientColor2` | string | - | สีเลขฐานสิบหกไล่ระดับสีที่สอง |
| `gradientAngle` | integer (0-360) | `180` | มุมไล่ระดับสีเป็นองศา |
| `feather` | integer (0-20) | `0` | รัศมีการเกลี่ยขอบ |
| `format` | `"png"` \| `"webp"` | `"png"` | รูปแบบเอาต์พุต |

## เบลอพื้นหลัง {#blur-background}

**เส้นทางเครื่องมือ:** `blur-background`  
**โมเดล:** rembg / BiRefNet (ใช้ร่วมกับ remove-background)

เบลอพื้นหลังในขณะที่ยังคงความคมชัดของวัตถุ

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | ความเข้มของการเบลอ |
| `feather` | integer (0-20) | `0` | รัศมีการเกลี่ยขอบ |
| `format` | `"png"` \| `"webp"` | `"png"` | รูปแบบเอาต์พุต |

## การขยายภาพ {#image-upscaling}

**เส้นทางเครื่องมือ:** `upscale`  
**โมเดล:** RealESRGAN (พร้อม Lanczos สำรองเมื่อไม่พร้อมใช้งาน)

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `scale` | number | `2` | ตัวคูณการขยาย |
| `model` | string | `"auto"` | รุ่นย่อยของโมเดล |
| `faceEnhance` | boolean | `false` | ใช้รอบการปรับปรุงใบหน้า GFPGAN |
| `denoise` | number | `0` | ความแรงในการลดสัญญาณรบกวน |
| `format` | string | `"auto"` | การแทนที่รูปแบบเอาต์พุต |
| `quality` | number | `95` | คุณภาพเอาต์พุต (1-100) |

## OCR / การแยกข้อความ {#ocr-text-extraction}

**เส้นทางเครื่องมือ:** `ocr`  
**โมเดล:** Tesseract (เร็ว), PaddleOCR PP-OCRv5 (สมดุล), PaddleOCR-VL 1.5 (ดีที่สุด)

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | ระดับการประมวลผล |
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | ประมวลผลภาพล่วงหน้าเพื่อเพิ่มความแม่นยำของ OCR |
| `engine` | string | - | เลิกใช้แล้ว แมป `tesseract` เป็น `fast`, `paddleocr` เป็น `balanced` |

ส่งคืนผลลัพธ์ที่มีโครงสร้างพร้อมกล่องขอบเขต คะแนนความเชื่อมั่น และบล็อกข้อความที่แยกออกมา

## PDF OCR {#pdf-ocr}

**เส้นทางเครื่องมือ:** `ocr-pdf`  
**โมเดล:** ระบบระดับเดียวกับ OCR ภาพ

แยกข้อความจากเอกสาร PDF ที่สแกนโดยใช้ OCR ที่ขับเคลื่อนด้วย AI ทีละหน้า

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | ระดับการประมวลผล |
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | การเลือกหน้า: `"all"`, `"1-3"`, `"1,3,5"` |

## เบลอใบหน้า / PII {#face-pii-blur}

**เส้นทางเครื่องมือ:** `blur-faces`  
**โมเดล:** การตรวจจับใบหน้า MediaPipe

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | รัศมีการเบลอแบบเกาส์เซียน |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์ความเชื่อมั่นในการตรวจจับ |

## การปรับปรุงใบหน้า {#face-enhancement}

**เส้นทางเครื่องมือ:** `enhance-faces`  
**โมเดล:** GFPGAN, CodeFormer

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | โมเดลการปรับปรุง |
| `strength` | number (0-1) | `0.8` | ความแรงของการปรับปรุง |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์การตรวจจับใบหน้า |
| `onlyCenterFace` | boolean | `false` | ปรับปรุงเฉพาะใบหน้าที่อยู่กึ่งกลางที่สุด |

## การลงสีด้วย AI {#ai-colorization}

**เส้นทางเครื่องมือ:** `colorize`  
**โมเดล:** DDColor (พร้อม OpenCV DNN สำรอง)

แปลงภาพถ่ายขาวดำหรือโทนสีเทาเป็นภาพสีเต็มรูปแบบ

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | ความแรงของความอิ่มตัวของสี |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | รุ่นย่อยของโมเดล |

## การลบสัญญาณรบกวน {#noise-removal}

**เส้นทางเครื่องมือ:** `noise-removal`  
**โมเดล:** SCUNet (ไปป์ไลน์ลดสัญญาณรบกวนแบบหลายระดับ)

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | ระดับการประมวลผล |
| `strength` | number (0-100) | `50` | ความแรงในการลดสัญญาณรบกวน |
| `detailPreservation` | number (0-100) | `50` | จำนวนรายละเอียดที่จะเก็บรักษา ยิ่งสูงยิ่งเก็บพื้นผิวไว้มาก |
| `colorNoise` | number (0-100) | `30` | ความแรงในการลดสัญญาณรบกวนสี |
| `format` | string | `"original"` | รูปแบบเอาต์พุต: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | คุณภาพการเข้ารหัสเอาต์พุต |

## การลบตาแดง {#red-eye-removal}

**เส้นทางเครื่องมือ:** `red-eye-removal`

ตรวจจับจุดสังเกตใบหน้า ระบุตำแหน่งบริเวณดวงตา และแก้ไขการอิ่มตัวเกินของช่องสีแดง

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | เกณฑ์การตรวจจับพิกเซลสีแดง |
| `strength` | number (0-100) | `70` | ความแรงในการแก้ไข |
| `format` | string | - | การแทนที่รูปแบบเอาต์พุต (เสริม) |
| `quality` | number (1-100) | `90` | คุณภาพเอาต์พุต |

## การกู้คืนภาพถ่าย {#photo-restoration}

**เส้นทางเครื่องมือ:** `restore-photo`

ไปป์ไลน์หลายขั้นตอนสำหรับภาพถ่ายเก่าหรือเสียหาย: การตรวจจับและซ่อมรอยขีดข่วน/รอยฉีก การปรับปรุงใบหน้า การลดสัญญาณรบกวน และการลงสีเสริม

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | ตรวจจับและซ่อมรอยขีดข่วน รอยฉีก |
| `faceEnhancement` | boolean | `true` | ใช้รอบการปรับปรุงใบหน้า |
| `fidelity` | number (0-1) | `0.7` | ความแรงในการปรับปรุงใบหน้า (สูงกว่า = อนุรักษ์นิยมมากกว่า) |
| `denoise` | boolean | `true` | ใช้รอบการลดสัญญาณรบกวน |
| `denoiseStrength` | number (0-100) | `25` | ความแรงในการลดสัญญาณรบกวน |
| `colorize` | boolean | `false` | ลงสีหลังการกู้คืน |
| `colorizeStrength` | number (0-100) | `85` | ความเข้มของการลงสี |

## รูปถ่ายหนังสือเดินทาง {#passport-photo}

**เส้นทางเครื่องมือ:** `passport-photo`  
**โมเดล:** จุดสังเกตใบหน้า MediaPipe + การลบพื้นหลัง BiRefNet

เวิร์กโฟลว์สองเฟส: วิเคราะห์ (ตรวจจับใบหน้า + ลบพื้นหลัง) จากนั้นสร้าง (ครอป ปรับขนาด เรียงเป็นแผ่น) รองรับกว่า 37 ประเทศใน 6 ภูมิภาค

### เฟส 1: วิเคราะห์ {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

รับไฟล์ภาพ (multipart) ส่งคืนข้อมูลจุดสังเกตใบหน้า ตัวอย่างแบบ base64 และขนาดของภาพ

### เฟส 2: สร้าง {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

รับ JSON body ที่มีผลลัพธ์จากเฟส 1 พร้อมด้วยการตั้งค่าการสร้าง:

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `jobId` | string | (จำเป็น) | Job ID จากเฟส 1 |
| `filename` | string | (จำเป็น) | ชื่อไฟล์ต้นฉบับจากเฟส 1 |
| `countryCode` | string | (จำเป็น) | รหัสประเทศ ISO (เช่น `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | ประเภทเอกสาร |
| `bgColor` | string | `"#FFFFFF"` | สีเลขฐานสิบหกของพื้นหลัง |
| `printLayout` | string | `"none"` | เลย์เอาต์การพิมพ์: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | ขนาดไฟล์สูงสุดเป็น KB (0 = ไม่จำกัด) |
| `dpi` | number (72-1200) | `300` | DPI เอาต์พุต |
| `customWidthMm` | number | - | ความกว้างกำหนดเองเป็นมิลลิเมตร (แทนที่ข้อกำหนดของประเทศ) |
| `customHeightMm` | number | - | ความสูงกำหนดเองเป็นมิลลิเมตร (แทนที่ข้อกำหนดของประเทศ) |
| `zoom` | number (0.5-3) | `1` | ตัวคูณการซูม |
| `adjustX` | number | `0` | การปรับตำแหน่งแนวนอน |
| `adjustY` | number | `0` | การปรับตำแหน่งแนวตั้ง |
| `landmarks` | object | (จำเป็น) | จุดสังเกตจากเฟส 1 |
| `imageWidth` | number | (จำเป็น) | ความกว้างของภาพจากเฟส 1 |
| `imageHeight` | number | (จำเป็น) | ความสูงของภาพจากเฟส 1 |

## การลบวัตถุ (Inpainting) {#object-erasing-inpainting}

**เส้นทางเครื่องมือ:** `erase-object`  
**โมเดล:** LaMa ผ่าน ONNX Runtime

มาสก์จะถูกส่งเป็น **ส่วนไฟล์ที่สอง** (fieldname `mask`) ไม่ใช่แบบ base64 พิกเซลสีขาวในมาสก์บ่งชี้บริเวณที่จะลบ การตั้งค่า `format` และ `quality` จะถูกส่งเป็นฟิลด์ฟอร์มระดับบนสุด

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `file` | file | (จำเป็น) | ภาพต้นฉบับ (multipart) |
| `mask` | file | (จำเป็น) | ภาพมาสก์ (multipart, fieldname `mask`, สีขาว = ลบ) |
| `format` | string | `"auto"` | รูปแบบเอาต์พุต: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | คุณภาพเอาต์พุต |

เร่งความเร็วด้วย CUDA เมื่อมี NVIDIA GPU พร้อมใช้งาน

## AI Canvas Expand {#ai-canvas-expand}

**เส้นทางเครื่องมือ:** `ai-canvas-expand`  
**โมเดล:** outpainting ที่ใช้ LaMa

ขยายพื้นที่แคนวาสของภาพในทิศทางใดก็ได้ และเติมบริเวณใหม่ด้วยเนื้อหาที่สร้างโดย AI ให้เข้ากับภาพที่มีอยู่

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | จำนวนพิกเซลที่จะขยายด้านบน |
| `extendRight` | integer | `0` | จำนวนพิกเซลที่จะขยายด้านขวา |
| `extendBottom` | integer | `0` | จำนวนพิกเซลที่จะขยายด้านล่าง |
| `extendLeft` | integer | `0` | จำนวนพิกเซลที่จะขยายด้านซ้าย |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | ระดับคุณภาพ |
| `format` | string | `"auto"` | รูปแบบเอาต์พุต: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | คุณภาพเอาต์พุต |

อย่างน้อยหนึ่งทิศทางในการขยายต้องมากกว่า 0

## Smart Crop {#smart-crop}

**เส้นทางเครื่องมือ:** `smart-crop`  
**โมเดล:** การตรวจจับใบหน้า MediaPipe (โหมดใบหน้าเท่านั้น)

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | กลยุทธ์การครอป: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | กลยุทธ์สำหรับโหมดวัตถุ |
| `width` | integer | - | ความกว้างเอาต์พุต |
| `height` | integer | - | ความสูงเอาต์พุต |
| `padding` | integer (0-50) | `0` | เปอร์เซ็นต์ระยะขอบรอบวัตถุ |
| `facePreset` | string | `"head-shoulders"` | การจัดกรอบสำเร็จรูปเมื่อ `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | เกณฑ์การตรวจจับใบหน้า |
| `threshold` | integer (0-255) | `30` | เกณฑ์การตรวจจับพื้นหลัง (โหมด trim) |
| `padToSquare` | boolean | `false` | เพิ่มระยะขอบผลลัพธ์ที่ตัดแล้วให้เป็นสี่เหลี่ยมจัตุรัส |
| `padColor` | string | `"#ffffff"` | สีพื้นหลังสำหรับการเพิ่มระยะขอบแบบสี่เหลี่ยมจัตุรัส |
| `targetSize` | integer | - | ขนาดเป้าหมายสำหรับเอาต์พุตที่เพิ่มระยะขอบ (พิกเซล) |
| `quality` | integer (1-100) | - | คุณภาพเอาต์พุต |

ค่า `mode` แบบเดิม `attention` และ `content` ยังคงรับได้และแมปไปเป็น `subject` และ `trim` ตามลำดับ

**การจัดกรอบใบหน้าสำเร็จรูป:**

| สำเร็จรูป | เหมาะสำหรับ |
|--------|---------|
| `closeup` | ภาพศีรษะ |
| `head-shoulders` | ภาพโปรไฟล์ |
| `upper-body` | LinkedIn / ทางการ |
| `half-body` | ครึ่งตัวบนเต็มตัว |

## ถอดเสียงเป็นข้อความ {#transcribe-audio}

**เส้นทางเครื่องมือ:** `transcribe-audio`  
**โมเดล:** faster-whisper

แปลงเสียงพูดเป็นข้อความ รองรับรูปแบบเอาต์พุตข้อความธรรมดา, SRT และ VTT

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | รูปแบบเอาต์พุต |

## คำบรรยายอัตโนมัติ {#auto-subtitles}

**เส้นทางเครื่องมือ:** `auto-subtitles`  
**โมเดล:** faster-whisper (แยกเสียงจากวิดีโอ แล้วถอดเสียงเป็นข้อความ)

สร้างไฟล์คำบรรยายจากแทร็กเสียงของวิดีโอ

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | รูปแบบคำบรรยายเอาต์พุต |

## เครื่องมือแก้ไขความโปร่งใส PNG {#png-transparency-fixer}

**เส้นทางเครื่องมือ:** `transparency-fixer`  
**โมเดล:** BiRefNet HR-matting (ความละเอียด 2048x2048)

แก้ไขไฟล์ PNG แบบ "โปร่งใสปลอม" ที่พื้นหลังถูกลบออกไปแล้วแต่ทิ้งขอบซ่อน, รัศมีเงา หรือสิ่งแปลกปลอมกึ่งโปร่งใสไว้ ใช้โมเดล matting ความละเอียดสูงของ BiRefNet เพื่อสร้างช่องอัลฟาที่สะอาด แล้วใช้การประมวลผล defringe ที่กำหนดค่าได้เพื่อลบการปนเปื้อนของสีตามขอบ

**สายสำรองกรณี OOM:** หาก BiRefNet HR-matting ใช้หน่วยความจำเกินที่มี เครื่องมือจะถอยกลับไปใช้ `birefnet-general` โดยอัตโนมัติ จากนั้นไปที่ `u2net`

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | ความแรงของ defringe ขอบเพื่อลบการปนเปื้อนของสี |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | รูปแบบภาพเอาต์พุต |
| `removeWatermark` | boolean | `false` | ใช้การประมวลผลล่วงหน้าเพื่อลบลายน้ำ (median filter) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## เครื่องมือที่มีความสามารถ AI เสริม {#tools-with-optional-ai-capabilities}

เครื่องมือต่อไปนี้ไม่ใช่เครื่องมือ Python sidecar แต่ใช้ฟีเจอร์ AI เมื่อเปิดใช้งานตัวเลือกบางอย่าง

### การปรับปรุงภาพ {#image-enhancement}

**เส้นทางเครื่องมือ:** `image-enhancement`  
**เอนจิน:** อิงการวิเคราะห์ (ฮิสโทแกรมและสถิติของ Sharp)

วิเคราะห์ภาพและใช้การแก้ไขอัตโนมัติสำหรับการเปิดรับแสง คอนทราสต์ สมดุลแสงขาว ความอิ่มตัวของสี ความคมชัด และสัญญาณรบกวน รองรับโหมดเฉพาะฉาก

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | โหมดฉากสำหรับการปรับจูนการแก้ไข |
| `intensity` | number (0-100) | `50` | ความแรงในการแก้ไขโดยรวม |
| `corrections.exposure` | boolean | `true` | ใช้การแก้ไขการเปิดรับแสง |
| `corrections.contrast` | boolean | `true` | ใช้การแก้ไขคอนทราสต์ |
| `corrections.whiteBalance` | boolean | `true` | ใช้การแก้ไขสมดุลแสงขาว |
| `corrections.saturation` | boolean | `true` | ใช้การแก้ไขความอิ่มตัวของสี |
| `corrections.sharpness` | boolean | `true` | ใช้การแก้ไขความคมชัด |
| `corrections.denoise` | boolean | `true` | ใช้การลดสัญญาณรบกวน |
| `deepEnhance` | boolean | `false` | เปิดใช้งานการลบสัญญาณรบกวนด้วย AI ผ่าน SCUNet (ต้องใช้ชุดฟีเจอร์ `upscale-enhance`) |

มีปลายทางการวิเคราะห์เพิ่มเติมที่ `POST /api/v1/tools/image/image-enhancement/analyze` ซึ่งส่งคืนการแก้ไขที่ตรวจพบโดยไม่นำมาใช้จริง

### การปรับขนาดตามเนื้อหา (Seam Carving) {#content-aware-resize-seam-carving}

**เส้นทางเครื่องมือ:** `content-aware-resize`  
**เอนจิน:** ไบนารี Go `caire` (ไม่ใช่ Python จึงไม่ได้ประโยชน์จาก GPU)

ปรับขนาดภาพอย่างชาญฉลาดด้วยการลบ seam ที่มีพลังงานต่ำ โดยรักษาเนื้อหาสำคัญไว้

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `width` | number | - | ความกว้างเป้าหมาย |
| `height` | number | - | ความสูงเป้าหมาย |
| `protectFaces` | boolean | `false` | ปกป้องบริเวณใบหน้าที่ตรวจพบ (ต้องใช้ชุดฟีเจอร์ `face-detection`) |
| `blurRadius` | number (0-20) | `4` | การเบลอล่วงหน้าสำหรับการคำนวณพลังงาน |
| `sobelThreshold` | number (1-20) | `2` | เกณฑ์ความไวของขอบ |
| `square` | boolean | `false` | บังคับเอาต์พุตเป็นสี่เหลี่ยมจัตุรัส |
