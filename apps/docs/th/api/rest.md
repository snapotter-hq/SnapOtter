---
description: "เอกสารอ้างอิง REST API ฉบับสมบูรณ์ เอนด์พอยต์ของเครื่องมือ การประมวลผลแบบแบตช์ ไปป์ไลน์ คลังไฟล์ การยืนยันตัวตน ทีม และการดำเนินงานของผู้ดูแลระบบ"
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 34c52fe6305e
---

# เอกสารอ้างอิง REST API {#rest-api-reference}

เอกสาร API แบบโต้ตอบพร้อมตัวอย่างคำขอและการตอบกลับมีให้ใช้งานที่ [http://localhost:1349/api/docs](http://localhost:1349/api/docs)

สเปกแบบเครื่องอ่านได้:
- `/api/v1/openapi.yaml` - สเปก OpenAPI 3.1
- `/llms.txt` - สรุปที่เป็นมิตรกับ LLM
- `/llms-full.txt` - เอกสารฉบับสมบูรณ์ที่เป็นมิตรกับ LLM

## การยืนยันตัวตน {#authentication}

ทุกเอนด์พอยต์ต้องมีการยืนยันตัวตน เว้นแต่ `AUTH_ENABLED=false`

### โทเคนเซสชัน {#session-token}

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

เซสชันจะหมดอายุหลังจาก 7 วัน (กำหนดค่าได้ผ่าน `SESSION_DURATION_HOURS`)

### API Keys {#api-keys}

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

คีย์จะมีคำนำหน้า `si_` และจัดเก็บเป็นแฮชแบบ scrypt คีย์ดิบจะแสดงเพียงครั้งเดียวและไม่สามารถเรียกคืนได้อีก

### เอนด์พอยต์การยืนยันตัวตน {#auth-endpoints}

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | สาธารณะ | ลงชื่อเข้าใช้ รับโทเคนเซสชัน |
| `POST` | `/api/auth/logout` | ยืนยันตัวตน | ทำลายเซสชันปัจจุบัน |
| `GET` | `/api/auth/session` | ยืนยันตัวตน | ตรวจสอบเซสชันปัจจุบัน |
| `POST` | `/api/auth/change-password` | ยืนยันตัวตน | เปลี่ยนรหัสผ่านของตนเอง (ทำให้เซสชันอื่นทั้งหมด + API keys ใช้ไม่ได้) |
| `GET` | `/api/auth/users` | ผู้ดูแลระบบ | แสดงรายชื่อผู้ใช้ทั้งหมด |
| `POST` | `/api/auth/register` | ผู้ดูแลระบบ | สร้างผู้ใช้ใหม่ |
| `PUT` | `/api/auth/users/:id` | ผู้ดูแลระบบ | อัปเดตบทบาทหรือทีมของผู้ใช้ |
| `POST` | `/api/auth/users/:id/reset-password` | ผู้ดูแลระบบ | รีเซ็ตรหัสผ่านของผู้ใช้ |
| `DELETE` | `/api/auth/users/:id` | ผู้ดูแลระบบ | ลบผู้ใช้ |
| `GET` | `/api/v1/config/auth` | สาธารณะ | ตรวจสอบว่าเปิดใช้งานการยืนยันตัวตนอยู่หรือไม่ (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | ยืนยันตัวตน | เริ่มการลงทะเบียน TOTP MFA ต้องใช้ฟีเจอร์ `mfa` ระดับ enterprise |
| `POST` | `/api/auth/mfa/verify` | ยืนยันตัวตน | ยืนยันการลงทะเบียน MFA ด้วยรหัส TOTP |
| `POST` | `/api/auth/mfa/complete` | สาธารณะ | ทำ MFA login challenge ที่ค้างอยู่ให้เสร็จสมบูรณ์ |
| `POST` | `/api/auth/mfa/disable` | ยืนยันตัวตน | ปิดใช้งาน MFA สำหรับผู้ใช้ปัจจุบัน |
| `POST` | `/api/auth/users/:id/mfa/reset` | ผู้ดูแลระบบ (`users:manage`) | รีเซ็ต MFA สำหรับผู้ใช้ |
| `GET` | `/api/auth/oidc/login` | สาธารณะ | เริ่มการลงชื่อเข้าใช้ OIDC เมื่อเปิดใช้งาน OIDC |
| `GET` | `/api/auth/oidc/callback` | สาธารณะ | callback การอนุญาตของ OIDC |
| `GET` | `/api/auth/saml/metadata` | สาธารณะ | XML เมทาดาทา SAML SP เมื่อเปิดใช้งาน SAML |
| `GET` | `/api/auth/saml/login` | สาธารณะ | เริ่มการลงชื่อเข้าใช้ SAML |
| `POST` | `/api/auth/saml/callback` | สาธารณะ | บริการ SAML assertion consumer |

เมื่อเปิดใช้งาน MFA สำหรับผู้ใช้ `POST /api/auth/login` จะคืนค่า `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` แทนโทเคนเซสชัน ส่ง `mfaToken` นั้นพร้อมรหัส TOTP หรือรหัสกู้คืนไปยัง `/api/auth/mfa/complete`

### สิทธิ์ {#permissions}

| สิทธิ์ | ผู้ดูแลระบบ | ผู้ใช้ |
|-----------|:-----:|:----:|
| ใช้เครื่องมือ | ✓ | ✓ |
| ไฟล์/ไปป์ไลน์/API keys ของตนเอง | ✓ | ✓ |
| ดูไฟล์/ไปป์ไลน์/คีย์ของผู้ใช้ทุกคน | ✓ | - |
| เขียนการตั้งค่า | ✓ | - |
| จัดการผู้ใช้และทีม | ✓ | - |
| จัดการแบรนด์ | ✓ | - |

## การตรวจสอบสถานะ {#health-check}

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | สาธารณะ | การตรวจสอบสถานะพื้นฐาน คืนค่า `{"status":"healthy","version":"..."}` พร้อม 200 หรือ `{"status":"unhealthy"}` พร้อม 503 หากไม่สามารถเข้าถึงฐานข้อมูลได้ |
| `GET` | `/api/v1/readyz` | สาธารณะ | Readiness probe ตรวจสอบ PostgreSQL, Redis, พื้นที่ดิสก์ และ S3 เมื่อมีการกำหนดค่า คืนค่า 503 เมื่ออินสแตนซ์ไม่ควรรับทราฟฟิก |
| `GET` | `/api/v1/admin/health` | ผู้ดูแลระบบ (`system:health`) | การวินิจฉัยแบบละเอียด รวมถึง uptime, โหมดการจัดเก็บ, สถานะฐานข้อมูล, สถานะคิว และความพร้อมใช้งานของ GPU |

## การใช้เครื่องมือ {#using-tools}

ทุกเครื่องมือใช้รูปแบบเดียวกัน:

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

`<section>` เป็นหนึ่งใน `image`, `video`, `audio`, `pdf` หรือ `files`

- การอัปโหลดคือ `multipart/form-data`
- `settings` เป็นสตริง JSON ที่มีตัวเลือกเฉพาะของเครื่องมือ
- `clientJobId` เป็นฟิลด์ฟอร์มที่ไม่บังคับสำหรับการเชื่อมโยงความคืบหน้าที่ผู้เรียกจัดเตรียมให้
- `fileId` เป็นฟิลด์ฟอร์มที่ไม่บังคับซึ่งอ้างอิงถึงรายการในคลังไฟล์ที่มีอยู่ เมื่อมีค่านี้ ผลลัพธ์ที่ประมวลผลแล้วจะถูกบันทึกเป็นเวอร์ชันใหม่ และการตอบกลับจะรวม `savedFileId`
- **เครื่องมือแบบเร็ว** โดยทั่วไปจะคืนค่า 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}` ดึงไฟล์ที่ประมวลผลแล้วจาก `downloadUrl`
- **เครื่องมือที่เข้าคิวใดๆ** สามารถคืนค่า 202 JSON ได้หากทำงานนานหรือเกินหน้าต่างการรอแบบซิงโครนัส: `{"jobId":"...","async":true}` เชื่อมต่อกับ SSE เพื่อรับความคืบหน้า แล้วดาวน์โหลดเมื่อเสร็จสมบูรณ์ (ดู [การติดตามความคืบหน้า](#progress-tracking))
- **แบตช์** เส้นทางจะคืนค่าไฟล์บีบอัด ZIP แบบสตรีมโดยตรง (พร้อมส่วนหัว `X-Job-Id`) สำหรับเครื่องมือที่ลงทะเบียนใน generic batch registry

## เอกสารอ้างอิงเครื่องมือ {#tools-reference}

### พรีเซ็ตการแปลง {#conversion-presets}

แคตตาล็อกที่ใช้ร่วมกันมีเอนด์พอยต์พรีเซ็ตการแปลงเฉพาะ 83 รายการ เช่น `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` และ `excel-to-csv` พรีเซ็ตเป็นเส้นทางเครื่องมือระดับหนึ่ง:

`POST /api/v1/tools/<section>/<presetId>`

แต่ละพรีเซ็ตล็อกรูปแบบเอาต์พุตและมอบหมายให้เครื่องมือฐาน เช่น `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` หรือ `convert-spreadsheet` ดู [พรีเซ็ตการแปลง](/th/tools/conversion-presets) สำหรับตารางเส้นทางฉบับสมบูรณ์และการตั้งค่าที่ไม่บังคับ

### พื้นฐาน {#essentials}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `resize` | ปรับขนาด | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement` พร้อมพรีเซ็ตโซเชียลมีเดีย 23 รายการ |
| `crop` | ครอป | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | หมุนและพลิก | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | แปลง | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | บีบอัด | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### การปรับปรุงประสิทธิภาพ {#optimization}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `optimize-for-web` | ปรับให้เหมาะกับเว็บ | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | ลบเมทาดาทา | - |
| `edit-metadata` | แก้ไขเมทาดาทา | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | เปลี่ยนชื่อแบบกลุ่ม | `pattern` (รองรับ `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | รูปภาพเป็น PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | ตัวสร้าง Favicon | `padding`, `backgroundColor`, `borderRadius` - สร้างขนาดมาตรฐานทั้งหมด |

### การปรับแต่ง {#adjustments}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `adjust-colors` | ปรับสี | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | การทำให้คมชัด | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | แทนที่สี | `sourceColor`, `targetColor` (สีที่ใช้แทน), `makeTransparent`, `tolerance` |
| `color-blindness` | จำลองภาวะตาบอดสี | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, ค่าเริ่มต้น "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelate | `blockSize` (2-128), `region` ({left, top, width, height} สำหรับการทำ pixelation บางส่วน) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### เครื่องมือ AI {#ai-tools}

เครื่องมือ AI ทั้งหมดทำงานบนฮาร์ดแวร์ของคุณ: CPU โดยค่าเริ่มต้น หรือ NVIDIA CUDA เมื่อมี NVIDIA GPU ที่รองรับ การเร่งความเร็ว iGPU ของ Intel/AMD ผ่าน VA-API, Quick Sync หรือ OpenCL ยังไม่รองรับสำหรับการอนุมาน AI ในปัจจุบัน ไม่ต้องใช้อินเทอร์เน็ต

| Tool ID | ชื่อ | โมเดล AI | การตั้งค่าหลัก |
|---------|------|---------|-------------|
| `remove-background` | ลบพื้นหลัง | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | ขยายภาพ | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | ลบวัตถุ | LaMa (ONNX) | ส่ง Mask เป็นส่วนไฟล์ที่สอง (fieldname `mask`), `format`, `quality` |
| `ocr` | OCR / สกัดข้อความ | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | เบลอใบหน้า / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | ครอปอัจฉริยะ | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | เพิ่มคุณภาพภาพ | อิงจากการวิเคราะห์ | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | เพิ่มคุณภาพใบหน้า | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | ลงสีด้วย AI | DDColor | `intensity`, `model` |
| `noise-removal` | ลบสัญญาณรบกวน | การลดสัญญาณรบกวนแบบหลายระดับ | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | ลบตาแดง | Face landmark + การวิเคราะห์สี | `sensitivity`, `strength` |
| `restore-photo` | ฟื้นฟูภาพถ่าย | ไปป์ไลน์หลายขั้นตอน | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | รูปถ่ายพาสปอร์ต | MediaPipe landmarks | โฟลว์แบบสองขั้นตอน การวิเคราะห์ใช้ multipart `file`; การสร้างใช้ JSON พร้อม `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), landmarks, มิติภาพ |
| `content-aware-resize` | ปรับขนาดแบบรับรู้เนื้อหา | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | ตัวแก้ความโปร่งใส PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | แทนที่พื้นหลัง | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | เบลอพื้นหลัง | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | ขยายผืนผ้าใบด้วย AI | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### ลายน้ำและการซ้อนทับ {#watermark-overlay}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `watermark-text` | ลายน้ำข้อความ | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | ลายน้ำรูปภาพ | `opacity`, `position`, `scale` - ไฟล์ที่สองคือลายน้ำ |
| `text-overlay` | ซ้อนทับข้อความ | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | การประกอบภาพ | `x`, `y`, `opacity`, `blend` - ไฟล์ที่สองถูกวางเป็นเลเยอร์ด้านบน |
| `meme-generator` | ตัวสร้างมีม | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps` รองรับโหมดเทมเพลต (JSON body พร้อม `templateId`) หรือโหมดรูปภาพกำหนดเอง (multipart พร้อมไฟล์) |

### ยูทิลิตี {#utilities}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `info` | ข้อมูลรูปภาพ | - (คืนค่า width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | เปรียบเทียบรูปภาพ | `mode` (side-by-side/overlay/diff), `diffThreshold` - ไฟล์ที่สองคือเป้าหมายการเปรียบเทียบ |
| `find-duplicates` | ค้นหารูปซ้ำ | `threshold` (ระยะห่างของ perceptual hash, ค่าเริ่มต้น 8) - หลายไฟล์ |
| `color-palette` | จานสี | `count` (จำนวนสีเด่น), `format` (hex/rgb) |
| `qr-generate` | ตัวสร้าง QR Code | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (ไฟล์ที่ไม่บังคับ) |
| `barcode-read` | ตัวอ่านบาร์โค้ด | - (ตรวจจับ QR, EAN, Code128, DataMatrix ฯลฯ โดยอัตโนมัติ) |
| `image-to-base64` | รูปภาพเป็น Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML เป็นรูปภาพ | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | ฮิสโทแกรม | `scale` (linear/log) - คืนค่าแผนภูมิฮิสโทแกรม RGB + สถิติต่อแชนเนล |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | ตัวสร้างบาร์โค้ด | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool) JSON body ไม่มีการอัปโหลดไฟล์ |

### เลย์เอาต์และการประกอบภาพ {#layout-composition}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `collage` | คอลลาจ / ตาราง | `template` (เลย์เอาต์ 25+ แบบ), `gap`, `backgroundColor`, `borderRadius` - หลายไฟล์ |
| `stitch` | เย็บ / รวมภาพ | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - หลายไฟล์ |
| `split` | แยกรูปภาพ | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | ขอบและกรอบ | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | ตกแต่งภาพหน้าจอ | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | ครอปวงกลม | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | เติมขอบรูปภาพ | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - หลายไฟล์ (2-64 รูป) |

### รูปแบบและการแปลง {#format-conversion}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `svg-to-raster` | SVG เป็นแรสเตอร์ | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | รูปภาพเป็น SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | เครื่องมือ GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), พารามิเตอร์เฉพาะแอ็กชัน |
| `gif-webp` | ตัวแปลง GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### เครื่องมือวิดีโอ {#video-tools}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `convert-video` | แปลงวิดีโอ | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | บีบอัดวิดีโอ | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | ตัดวิดีโอ | `startS`, `endS`, `precise` (bool, ตัดแบบแม่นยำระดับเฟรม) |
| `mute-video` | ปิดเสียงวิดีโอ | - |
| `video-to-gif` | วิดีโอเป็น GIF | `fps` (1-30), `width`, `startS`, `durationS` (สูงสุด 60 วินาที) |
| `resize-video` | ปรับขนาดวิดีโอ | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | ครอปวิดีโอ | `width`, `height`, `x`, `y` |
| `rotate-video` | หมุนวิดีโอ | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | เปลี่ยน FPS | `fps` (1-120) |
| `video-color` | สีวิดีโอ | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | ความเร็ววิดีโอ | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | ย้อนวิดีโอ | - (สูงสุด 5 นาที) |
| `video-loudnorm` | ปรับระดับเสียงให้เท่ากัน | - (EBU R128) |
| `aspect-pad` | เติมขอบตามอัตราส่วน | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | เติมขอบด้วยความเบลอ | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | ลายน้ำวิดีโอ | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | ทำวิดีโอให้นิ่ง | `smoothing` (5-60, เป็นเฟรม) |
| `gif-to-video` | GIF เป็นวิดีโอ | `format` (mp4/webm/mov) |
| `video-to-webp` | วิดีโอเป็น WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | วิดีโอเป็นเฟรม | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | รวมวิดีโอ | - (หลายไฟล์ ปรับเป็นความละเอียดของวิดีโอแรก) |
| `replace-audio` | แทนที่เสียง | - (วิดีโอ + ไฟล์เสียง สองไฟล์) |
| `burn-subtitles` | ฝังคำบรรยาย (Burn) | `fontSize` (8-72) - วิดีโอ + ไฟล์คำบรรยาย |
| `embed-subtitles` | ฝังคำบรรยาย (Embed) | `language` (รหัส ISO 639-2/B) - วิดีโอ + ไฟล์คำบรรยาย |
| `extract-subtitles` | สกัดคำบรรยาย | - (ส่งออก SRT) |
| `images-to-video` | รูปภาพเป็นวิดีโอ | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - หลายไฟล์ |
| `video-metadata` | ล้างเมทาดาทาวิดีโอ | - |
| `auto-subtitles` | คำบรรยายอัตโนมัติ (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | สกัดเสียง | `format` (mp3/wav/m4a/ogg) |

### เครื่องมือเสียง {#audio-tools}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `convert-audio` | แปลงเสียง | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | ตัดเสียง | `startS`, `endS` |
| `volume-adjust` | ปรับระดับเสียง | `gainDb` (-30 ถึง 30) |
| `normalize-audio` | ปรับระดับเสียงให้เท่ากัน | - (EBU R128, -16 LUFS) |
| `fade-audio` | เฟดเสียง | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | ย้อนเสียง | - |
| `audio-speed` | ความเร็วเสียง | `factor` (0.25-4) |
| `pitch-shift` | เปลี่ยนระดับเสียง (Pitch) | `semitones` (-12 ถึง 12) |
| `audio-channels` | ช่องสัญญาณเสียง | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | ลบความเงียบ | `thresholdDb` (-80 ถึง -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | ลดสัญญาณรบกวน | `strength` (light/medium/strong) |
| `merge-audio` | รวมเสียง | `format` (mp3/wav/flac/m4a) - หลายไฟล์ |
| `split-audio` | แยกเสียง | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | ตัวสร้างริงโทน | `startS`, `durationS` (1-30) |
| `waveform-image` | รูปภาพเวฟฟอร์ม | `width`, `height`, `color` (hex) |
| `audio-metadata` | เมทาดาทาเสียง | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | ถอดเสียงเป็นข้อความ (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### เครื่องมือเอกสาร {#document-tools}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `merge-pdf` | รวม PDF | - (หลายไฟล์ สูงสุด 20 PDF) |
| `split-pdf` | แยก PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | บีบอัด PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | หมุน PDF | `angle` (90/180/270), `range` (ช่วงหน้า) |
| `extract-pages` | สกัดหน้า | `range` (ไวยากรณ์ qpdf เช่น "1-5,8,10-z") |
| `remove-pages` | ลบหน้า | `pages` (ช่วง qpdf ที่จะลบ) |
| `organize-pdf` | จัดระเบียบ PDF | `order` (ลำดับหน้า qpdf เช่น "3,1,2,5-z") |
| `protect-pdf` | ป้องกัน PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | ปลดล็อก PDF | `password` |
| `repair-pdf` | ซ่อมแซม PDF | - |
| `linearize-pdf` | ปรับ PDF ให้เหมาะกับเว็บ | - (linearize เพื่อการดูบนเว็บที่รวดเร็ว) |
| `grayscale-pdf` | PDF ระดับสีเทา | - |
| `pdfa-convert` | แปลงเป็น PDF/A | - (PDF/A-2 สำหรับการเก็บถาวร) |
| `crop-pdf` | ครอป PDF | `margin` (0-2000 จุด) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | สมุดพับ PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | ลายน้ำ PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | เลขหน้า PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Flatten PDF | - (ทำให้ฟอร์มและคำอธิบายประกอบกลายเป็นภาพ) |
| `redact-pdf` | ปกปิดข้อมูล PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | ลงนาม PDF | เส้นทาง multipart กำหนดเองพร้อม PDF `file`, ไฟล์ลายเซ็น `sig0`, `sig1` และอาร์เรย์ JSON `placements` |
| `pdf-to-text` | PDF เป็นข้อความ | - |
| `pdf-to-word` | PDF เป็น Word | - |
| `pdf-metadata` | เมทาดาทา PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | แปลงเอกสาร | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | แปลงงานนำเสนอ | `format` (pptx/odp) |
| `convert-spreadsheet` | แปลงสเปรดชีต | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel เป็น PDF | - |
| `word-to-pdf` | Word เป็น PDF | - |
| `powerpoint-to-pdf` | PowerPoint เป็น PDF | - |
| `html-to-pdf` | HTML เป็น PDF | - (ปิดใช้งานทรัพยากรระยะไกล) |
| `markdown-to-docx` | Markdown เป็น Word | - |
| `markdown-to-html` | Markdown เป็น HTML | - |
| `markdown-to-pdf` | Markdown เป็น PDF | - (ปิดใช้งานทรัพยากรระยะไกล) |
| `epub-convert` | แปลง EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | แปลงเป็น EPUB | - (รับ .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF เป็นรูปภาพ | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF เป็น JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF เป็น PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF เป็น TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### เครื่องมือไฟล์ {#file-tools}

| Tool ID | ชื่อ | การตั้งค่าหลัก |
|---------|------|-------------|
| `chart-maker` | ตัวสร้างแผนภูมิ | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV เป็น Excel | `sheet` (หมายเลขเวิร์กชีตสำหรับอินพุต XLSX) - แบบสองทิศทาง |
| `csv-json` | CSV เป็น JSON | `pretty` (bool) - แบบสองทิศทาง |
| `json-xml` | JSON เป็น XML | `pretty` (bool) - แบบสองทิศทาง |
| `split-csv` | แยก CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | รวม CSV | - (หลายไฟล์ คอลัมน์ตรงกัน) |
| `yaml-json` | YAML / JSON | - (แบบสองทิศทาง) |
| `xml-to-csv` | XML เป็น CSV | - (ค้นหาองค์ประกอบที่ซ้ำโดยอัตโนมัติ) |
| `excel-to-csv` | Excel เป็น CSV | พรีเซ็ตการแปลงเฉพาะที่รองรับโดย `convert-spreadsheet` |
| `create-zip` | สร้าง ZIP | - (หลายไฟล์ 2-50 ไฟล์) |
| `extract-zip` | แตก ZIP | - (ป้องกัน bomb) |

### HTML เป็นรูปภาพ {#html-to-image}

จับภาพหน้าเว็บเป็นรูปภาพ ต่างจากเครื่องมืออื่น เอนด์พอยต์นี้รับ `application/json` แทน multipart form data (ไม่ต้องอัปโหลดไฟล์)

**เอนด์พอยต์:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| พารามิเตอร์ | ประเภท | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|---------|-------------|
| `url` | string | (จำเป็น) | URL ที่จะจับภาพ (http/https เท่านั้น) |
| `format` | string | `"png"` | รูปแบบเอาต์พุต: `jpg`, `png`, `webp` |
| `quality` | number | `90` | คุณภาพ 1-100 (JPG/WebP เท่านั้น) |
| `fullPage` | boolean | `false` | จับภาพทั้งหน้าที่เลื่อนได้ |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | ความกว้าง viewport กำหนดเอง 320-3840 |
| `viewportHeight` | number | `720` | ความสูง viewport กำหนดเอง 320-2160 |

**ตัวอย่าง:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**การตอบกลับ:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### เส้นทางย่อยของเครื่องมือ {#tool-sub-routes}

เครื่องมือบางตัวมีเอนด์พอยต์เพิ่มเติมนอกเหนือจาก `POST /api/v1/tools/<section>/<toolId>` มาตรฐาน:

| Method | Path | คำอธิบาย |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | คืนค่า tool ID ยอดนิยม โดยย้อนกลับไปใช้รายการเริ่มต้นที่คัดสรรไว้เมื่อข้อมูลการใช้งานมีน้อย |
| `POST` | `/api/v1/tools/image/remove-background/effects` | ใช้เอฟเฟกต์พื้นหลัง (color/gradient/blur/shadow) โดยไม่ต้องรัน AI ใหม่ ใช้ mask ที่แคชไว้จากการลบครั้งแรก |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | อ่านเมทาดาทา EXIF/IPTC/XMP ที่มีอยู่จากรูปภาพ |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | ตรวจสอบฟิลด์เมทาดาทาก่อนลบ |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | เฟส 1: การตรวจจับใบหน้าด้วย AI + การลบพื้นหลัง คืนค่า face landmarks และข้อมูลที่แคชไว้ |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | เฟส 2: ครอป ปรับขนาด และปูภาพโดยใช้การวิเคราะห์ที่แคชไว้ ไม่มีการรัน AI ใหม่ |
| `POST` | `/api/v1/tools/image/gif-tools/info` | รับเมทาดาทา GIF (จำนวนเฟรม มิติ ระยะเวลา) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | รับเมทาดาทา PDF (จำนวนหน้า มิติ) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | สร้างตัวอย่างของหน้า PDF ที่ระบุ |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | รับเมทาดาทา PDF สำหรับพรีเซ็ต JPG เฉพาะ |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | สร้างตัวอย่างหน้า PDF ของพรีเซ็ต JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | รับเมทาดาทา PDF สำหรับพรีเซ็ต PNG เฉพาะ |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | สร้างตัวอย่างหน้า PDF ของพรีเซ็ต PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | รับเมทาดาทา PDF สำหรับพรีเซ็ต TIFF เฉพาะ |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | สร้างตัวอย่างหน้า PDF ของพรีเซ็ต TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | แปลง SVG หลายไฟล์เป็นแรสเตอร์แบบแบตช์ |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | วิเคราะห์คุณภาพภาพและคืนค่าคำแนะนำการเพิ่มคุณภาพ |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | ตัวอย่างแบบเบาสำหรับการปรับพารามิเตอร์แบบสด คืนค่ารูปภาพที่ปรับให้เหมาะสมพร้อมส่วนหัวขนาด |

## การประมวลผลแบบแบตช์ {#batch-processing}

ใช้เครื่องมือที่รองรับแบตช์ทั่วไปกับหลายไฟล์พร้อมกัน คืนค่าไฟล์บีบอัด ZIP เส้นทางที่มีหลายไฟล์หรือหลายขั้นตอนกำหนดเอง เช่น การลงนาม PDF, PDF OCR และเส้นทางพรีเซ็ต PDF-เป็น-รูปภาพ ใช้สัญญาเอนด์พอยต์ของตนเองแทนเส้นทาง `/batch` ทั่วไป

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

การทำงานพร้อมกันควบคุมโดย `CONCURRENT_JOBS` (ค่าเริ่มต้น: ตรวจจับอัตโนมัติจากคอร์ CPU) `MAX_BATCH_SIZE` จำกัดจำนวนไฟล์ต่อแบตช์ (ค่าเริ่มต้น: 100; ตั้งเป็น 0 สำหรับไม่จำกัด)

## ไปป์ไลน์ {#pipelines}

### รันไปป์ไลน์ {#execute-a-pipeline}

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

เอาต์พุตของแต่ละขั้นตอนคืออินพุตของขั้นตอนถัดไป ไปป์ไลน์อนุญาต 20 ขั้นตอนโดยค่าเริ่มต้น กำหนดค่าได้ผ่าน `MAX_PIPELINE_STEPS` ตั้งค่า `MAX_PIPELINE_STEPS=0` เพื่อลบขีดจำกัด

### บันทึกและจัดการไปป์ไลน์ {#save-and-manage-pipelines}

| Method | Path | คำอธิบาย |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | บันทึกไปป์ไลน์ที่ตั้งชื่อ (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | แสดงรายการไปป์ไลน์ที่บันทึกไว้ (ผู้ดูแลระบบเห็นทั้งหมด; ผู้ใช้เห็นของตนเอง) |
| `DELETE` | `/api/v1/pipeline/:id` | ลบ (เจ้าของหรือผู้ดูแลระบบ) |
| `GET` | `/api/v1/pipeline/tools` | แสดงรายการ tool ID ที่ใช้ได้กับขั้นตอนไปป์ไลน์ |

## การติดตามความคืบหน้า {#progress-tracking}

งานที่ทำงานนาน เครื่องมือที่เข้าคิว งานแบตช์ และไปป์ไลน์จะส่งความคืบหน้าแบบเรียลไทม์ผ่าน Server-Sent Events สตรีมความคืบหน้าเป็นสาธารณะและระบุด้วย job ID ดังนั้นไคลเอนต์ไม่จำเป็นต้องส่งส่วนหัว Authorization เพื่ออ่าน

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

รูปแบบอีเวนต์:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

คุณสามารถขอยกเลิกงานที่เข้าคิวหรือกำลังทำงานได้ด้วย `POST /api/v1/jobs/:jobId/cancel` การตอบกลับคือ `{"canceled":true|false}`

## คลังไฟล์ {#file-library}

การจัดเก็บไฟล์แบบถาวรพร้อมประวัติเวอร์ชัน

| Method | Path | คำอธิบาย |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | อัปโหลดไฟล์ไปยัง workspace (การประมวลผลชั่วคราว) |
| `POST` | `/api/v1/files/upload` | อัปโหลดไฟล์ไปยังคลังไฟล์ถาวร |
| `POST` | `/api/v1/files/save-result` | บันทึกผลการประมวลผลของเครื่องมือเป็นเวอร์ชันไฟล์ใหม่ |
| `GET` | `/api/v1/files` | แสดงรายการไฟล์ที่บันทึกไว้ (แบ่งหน้า พร้อมการค้นหา) |
| `GET` | `/api/v1/files/:id` | รับเมทาดาทาไฟล์ + สายเวอร์ชัน |
| `GET` | `/api/v1/files/:id/download` | ดาวน์โหลดไฟล์ |
| `GET` | `/api/v1/files/:id/thumbnail` | รับภาพขนาดย่อ JPEG 300px |
| `DELETE` | `/api/v1/files` | ลบไฟล์และสายเวอร์ชันของไฟล์แบบกลุ่ม (body: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | ดึง URL ระยะไกลเข้าสู่ workspace สำหรับการนำเข้าแบบอิง URL |
| `POST` | `/api/v1/preview` | สร้างตัวอย่าง WebP ที่เข้ากันได้กับเบราว์เซอร์ (สำหรับรูปแบบ HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | สตรีมตัวอย่างที่แคชไว้หรือสร้างขึ้นที่เข้ากันได้กับเบราว์เซอร์สำหรับ PDF, เอกสาร office, วิดีโอ หรือไฟล์เสียงที่บันทึกไว้ |
| `POST` | `/api/v1/preview/generate` | สร้างตัวอย่าง MP4 หรือ MP3 แบบทันทีสำหรับไฟล์สื่อที่อัปโหลดโดยไม่ต้องบันทึกก่อน |
| `GET` | `/api/v1/download/:jobId/:filename` | ดาวน์โหลดไฟล์ที่ประมวลผลแล้วจาก workspace |

หากต้องการบันทึกผลลัพธ์ของเครื่องมือไปยังคลังโดยอัตโนมัติ ให้รวม `fileId` เป็นฟิลด์ multipart form ที่อ้างอิงถึงไฟล์ในคลังที่มีอยู่ ผลลัพธ์ที่ประมวลผลแล้วจะถูกบันทึกเป็นเวอร์ชันใหม่

## การจัดการ API Key {#api-key-management}

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | ยืนยันตัวตน | สร้างคีย์ใหม่ - แสดงเพียงครั้งเดียว |
| `GET` | `/api/v1/api-keys` | ยืนยันตัวตน | แสดงรายการคีย์ (name, id, lastUsedAt - ไม่ใช่คีย์ดิบ) |
| `DELETE` | `/api/v1/api-keys/:id` | ยืนยันตัวตน | ลบคีย์ |

## ทีม {#teams}

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | ผู้ดูแลระบบ (`teams:manage`) | แสดงรายการทีม |
| `POST` | `/api/v1/teams` | ผู้ดูแลระบบ (`teams:manage`) | สร้างทีม |
| `PUT` | `/api/v1/teams/:id` | ผู้ดูแลระบบ (`teams:manage`) | เปลี่ยนชื่อทีม |
| `DELETE` | `/api/v1/teams/:id` | ผู้ดูแลระบบ (`teams:manage`) | ลบทีม (ไม่สามารถลบทีมเริ่มต้นหรือทีมที่มีสมาชิก) |

## การตั้งค่า {#settings}

การกำหนดค่าคีย์-ค่าแบบรันไทม์ (อ่านได้โดยผู้ใช้ที่ยืนยันตัวตนแล้วทุกคน เขียนได้โดยผู้ดูแลระบบเท่านั้น)

| Method | Path | คำอธิบาย |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | รับการตั้งค่าทั้งหมด |
| `PUT` | `/api/v1/settings` | อัปเดตการตั้งค่าแบบกลุ่ม (JSON body พร้อมคู่คีย์-ค่า) |
| `GET` | `/api/v1/settings/:key` | รับการตั้งค่าที่ระบุตามคีย์ |

คีย์ที่รู้จัก: `disabledTools` (อาร์เรย์ JSON ของ tool ID), `enableExperimentalTools` (สตริง bool), `loginAttemptLimit` (ตัวเลข)

## ค่าปรับตั้ง {#preferences}

ค่าปรับตั้งต่อผู้ใช้แยกจากการตั้งค่าของอินสแตนซ์ ผู้ใช้ที่ยืนยันตัวตนแล้วทุกคนสามารถอ่านและอัปเดตแผนที่ค่าปรับตั้งของตนเองได้

| Method | Path | คำอธิบาย |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | รับค่าปรับตั้งของผู้ใช้ปัจจุบันในรูปแบบ `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | เพิ่มหรืออัปเดตคีย์ค่าปรับตั้งหนึ่งรายการขึ้นไปสำหรับผู้ใช้ปัจจุบัน |

## บทบาท {#roles}

การจัดการบทบาทกำหนดเองพร้อมสิทธิ์แบบละเอียด

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | ผู้ดูแลระบบ (`audit:read`) | แสดงรายการบทบาททั้งหมดพร้อมจำนวนผู้ใช้ |
| `POST` | `/api/v1/roles` | ผู้ดูแลระบบ (`security:manage`) | สร้างบทบาทกำหนดเอง (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | ผู้ดูแลระบบ (`security:manage`) | อัปเดตบทบาทกำหนดเอง (ไม่สามารถแก้ไขบทบาทในตัว) |
| `DELETE` | `/api/v1/roles/:id` | ผู้ดูแลระบบ (`security:manage`) | ลบบทบาทกำหนดเอง (ไม่สามารถลบบทบาทในตัว; ผู้ใช้ที่ได้รับผลกระทบจะกลับไปใช้บทบาท `user`) |

สิทธิ์ที่มีให้ (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`

## บันทึกการตรวจสอบ {#audit-log}

เอนด์พอยต์เฉพาะผู้ดูแลระบบสำหรับตรวจสอบการกระทำที่เกี่ยวข้องกับความปลอดภัย

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | ผู้ดูแลระบบ (`audit:read`) | บันทึกการตรวจสอบแบบแบ่งหน้าพร้อมตัวกรองที่ไม่บังคับ |

พารามิเตอร์คิวรี:

| พารามิเตอร์ | คำอธิบาย |
|-----------|-------------|
| `page` | หมายเลขหน้า (ค่าเริ่มต้น: 1) |
| `limit` | รายการต่อหน้า (ค่าเริ่มต้น: 50, สูงสุด: 100) |
| `action` | กรองตามประเภทการกระทำ (เช่น `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | กรองตามที่อยู่ IP ต้นทาง |
| `from` | กรองรายการหลังวันที่ ISO 8601 นี้ |
| `to` | กรองรายการก่อนวันที่ ISO 8601 นี้ |

## การวิเคราะห์ {#analytics}

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | สาธารณะ | รับการกำหนดค่าการวิเคราะห์ที่มีผล (PostHog key, Sentry DSN, sample rate) คีย์ DSN และ instance ID จะว่างเปล่าเมื่อปิดการวิเคราะห์ ไม่ว่าจะจากการ bake ตอนคอมไพล์หรือการตั้งค่า `analyticsEnabled` ของอินสแตนซ์ |
| `POST` | `/api/v1/feedback` | ยืนยันตัวตน | ส่งความคิดเห็นของผู้ใช้อย่างชัดแจ้งไปยังโปรเจกต์ PostHog ที่กำหนดค่าไว้เป็น `feedback_submitted` เส้นทางนี้เคารพเกตการวิเคราะห์ จำกัดอัตราการส่ง ตัดฟิลด์ติดต่อออกเว้นแต่ `contactOk` เป็นจริง และไม่รับเนื้อหาไฟล์ ชื่อไฟล์ เส้นทางอัปโหลด หรือข้อความข้อผิดพลาดส่วนตัวแบบดิบ เมื่อปิดการวิเคราะห์ จะคืนค่า `{ "ok": true, "accepted": false }` |
| `PUT` | `/api/v1/settings` | ผู้ดูแลระบบ (`settings:write`) | ตั้งค่าการเลือกไม่เข้าร่วมทั่วทั้งอินสแตนซ์ ส่ง JSON body `{ "analyticsEnabled": "false" }` เพื่อปิดการวิเคราะห์สำหรับทุกคน หรือ `"true"` เพื่อเปิดกลับมาอีกครั้ง |

## ฟีเจอร์ / AI Bundles {#features-ai-bundles}

จัดการ AI feature bundles (ติดตั้ง/ถอนการติดตั้งแพ็กเกจโมเดล AI ในสภาพแวดล้อม Docker) ควรใช้เอนด์พอยต์การติดตั้งระดับเครื่องมือเมื่อเปิดใช้งานเครื่องมือจากระบบอัตโนมัติกำหนดเอง: เครื่องมือ AI บางตัวต้องการ shared bundle มากกว่าหนึ่งรายการ และเอนด์พอยต์นี้จะข้าม bundle ที่ติดตั้งแล้วโดยเข้าคิวเฉพาะที่ขาดหายไป

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | ยืนยันตัวตน | แสดงรายการ feature bundle ทั้งหมดและสถานะการติดตั้ง |
| `POST` | `/api/v1/admin/features/:bundleId/install` | ผู้ดูแลระบบ (`features:manage`) | ติดตั้ง feature bundle (แบบอะซิงโครนัส คืนค่า `jobId` สำหรับการติดตามความคืบหน้า) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | ผู้ดูแลระบบ (`features:manage`) | ติดตั้งทุก bundle ที่เครื่องมือต้องการ; คืนค่าสถานะเข้าคิว/ข้ามต่อ bundle |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | ผู้ดูแลระบบ (`features:manage`) | ถอนการติดตั้ง feature bundle และล้างไฟล์โมเดล |
| `GET` | `/api/v1/admin/features/disk-usage` | ผู้ดูแลระบบ (`features:manage`) | รับการใช้พื้นที่ดิสก์รวมของโมเดล AI |
| `POST` | `/api/v1/admin/features/import` | ผู้ดูแลระบบ (`features:manage`) | นำเข้าไฟล์บีบอัด AI bundle แบบออฟไลน์ |

## การดำเนินงานของผู้ดูแลระบบ {#admin-operations}

เอนด์พอยต์ปฏิบัติการสำหรับการสังเกตการณ์ การสนับสนุน การรายงานการใช้งาน และสถานะการสำรองข้อมูล

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | ผู้ดูแลระบบ (`settings:write`) | อ่านระดับ log รันไทม์ปัจจุบัน |
| `POST` | `/api/v1/admin/log-level` | ผู้ดูแลระบบ (`settings:write`) | เปลี่ยนระดับ log รันไทม์ (`fatal`, `error`, `warn`, `info`, `debug`, `trace` หรือ `silent`) |
| `GET` | `/api/v1/metrics` | ผู้ดูแลระบบ (`system:health`) | Prometheus metrics ในรูปแบบข้อความ |
| `GET` | `/api/v1/admin/support-bundle` | ผู้ดูแลระบบ (`system:health`) | ดาวน์โหลด ZIP ชุดสนับสนุนการวินิจฉัยที่ปกปิดข้อมูลแล้ว |
| `GET` | `/api/v1/admin/usage` | ผู้ดูแลระบบ (`audit:read`) | ข้อมูลแดชบอร์ดการใช้งาน พร้อมพารามิเตอร์คิวรี `days` ที่ไม่บังคับ |
| `GET` | `/api/v1/admin/backup-status` | ผู้ดูแลระบบ (`system:health`) | อ่านเมทาดาทาการสำรองข้อมูลล่าสุดและสถานะความใหม่ |
| `POST` | `/api/v1/admin/backup-status` | ผู้ดูแลระบบ (`system:health`) | บันทึกการสำรองข้อมูลที่เสร็จสมบูรณ์ (`type`, `sizeBytes` ที่ไม่บังคับ, `notes` ที่ไม่บังคับ) |

## Enterprise API {#enterprise-apis}

เส้นทางเหล่านี้ถูกเกตด้วยไลเซนส์ตามฟีเจอร์ enterprise ที่เกี่ยวข้อง ยังคงต้องมีสิทธิ์ SnapOtter ที่ระบุไว้

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | ผู้ดูแลระบบ (`audit:read`) | ส่งออกรายการการตรวจสอบเป็น JSON หรือ CSV พร้อมตัวกรอง |
| `GET` | `/api/v1/enterprise/config/export` | ผู้ดูแลระบบ (`system:health`) | ส่งออกการกำหนดค่าอินสแตนซ์ บทบาทกำหนดเอง และทีมที่ปกปิดข้อมูลแล้ว |
| `POST` | `/api/v1/enterprise/config/import` | ผู้ดูแลระบบ (`system:health`) | นำเข้าการกำหนดค่า พร้อมการทดลองรันที่ไม่บังคับ |
| `GET` | `/api/v1/enterprise/ip-allowlist` | ผู้ดูแลระบบ (`security:manage`) | อ่านรายการอนุญาต CIDR ที่กำหนดค่าไว้ |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | ผู้ดูแลระบบ (`security:manage`) | อัปเดตรายการอนุญาต CIDR พร้อมการป้องกันการล็อกตัวเองออก |
| `GET` | `/api/v1/enterprise/legal-hold` | ผู้ดูแลระบบ (`compliance:manage`) | แสดงรายการการระงับทางกฎหมายของผู้ใช้และทีม |
| `PUT` | `/api/v1/enterprise/legal-hold` | ผู้ดูแลระบบ (`compliance:manage`) | ใช้หรือปลดการระงับทางกฎหมายกับผู้ใช้หรือทีม |
| `POST` | `/api/v1/enterprise/scim/token` | ผู้ดูแลระบบ (`users:manage`) | สร้าง SCIM bearer token คืนค่าเพียงครั้งเดียว |
| `DELETE` | `/api/v1/enterprise/scim/token` | ผู้ดูแลระบบ (`users:manage`) | เพิกถอน SCIM bearer token ปัจจุบัน |
| `GET` | `/api/v1/enterprise/siem/config` | ผู้ดูแลระบบ (`webhooks:manage`) | อ่านการกำหนดค่าการส่งต่อ SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | ผู้ดูแลระบบ (`webhooks:manage`) | อัปเดตการกำหนดค่าการส่งต่อ SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | ผู้ดูแลระบบ (`webhooks:manage`) | แสดงรายการปลายทาง webhook |
| `POST` | `/api/v1/enterprise/webhooks` | ผู้ดูแลระบบ (`webhooks:manage`) | สร้างปลายทาง webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | ผู้ดูแลระบบ (`webhooks:manage`) | อัปเดตปลายทาง webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | ผู้ดูแลระบบ (`webhooks:manage`) | ลบปลายทาง webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | ผู้ดูแลระบบ (`webhooks:manage`) | ส่ง payload webhook ทดสอบ |
| `POST` | `/api/v1/enterprise/users/:id/export` | ผู้ดูแลระบบ (`compliance:manage`) | เริ่มงานส่งออกข้อมูลผู้ใช้ตาม GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | ผู้ดูแลระบบ (`compliance:manage`) | อ่านสถานะการส่งออก GDPR และ URL ดาวน์โหลด |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | ผู้ดูแลระบบ (`compliance:manage`) | ล้างข้อมูลของผู้ใช้อย่างถาวรหลังการยืนยัน |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | ผู้ดูแลระบบ (`compliance:manage`) | ล้างข้อมูลของทีมอย่างถาวรหลังการยืนยัน |
| `GET` | `/api/v1/admin/version` | ผู้ดูแลระบบ (`system:health`) | อ่านเมทาดาทาเวอร์ชันของแอป build, Node และ schema |
| `GET` | `/api/v1/admin/migrations/pending` | ผู้ดูแลระบบ (`system:health`) | เปรียบเทียบ migration ที่แพ็กเกจไว้กับ migration ที่ใช้แล้ว |
| `GET` | `/api/v1/admin/upgrade-check` | ผู้ดูแลระบบ (`system:health`) | รันการตรวจสอบความพร้อมในการอัปเกรด |

### SCIM 2.0 {#scim-2-0}

เอนด์พอยต์การค้นพบ SCIM เป็นสาธารณะ เอนด์พอยต์ผู้ใช้และกลุ่มต้องใช้ SCIM bearer token ที่สร้างไว้ด้านบน

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | สาธารณะ | ความสามารถของเซิร์ฟเวอร์ SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | สาธารณะ | การค้นพบ schema ของ SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | สาธารณะ | การค้นพบประเภททรัพยากรของ SCIM |
| `GET` | `/api/v1/scim/v2/Users` | SCIM token | แสดงรายการผู้ใช้ พร้อมตัวกรอง SCIM ที่ไม่บังคับ |
| `POST` | `/api/v1/scim/v2/Users` | SCIM token | สร้างผู้ใช้ |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM token | รับผู้ใช้ |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM token | แทนที่ผู้ใช้ |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM token | ปิดใช้งานผู้ใช้แบบ soft |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM token | แสดงรายการทีมเป็นกลุ่ม SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM token | สร้างทีม |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM token | รับทีม |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM token | แทนที่ทีมและสมาชิกกลุ่ม |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM token | ลบทีม |

## เทมเพลตมีม {#meme-templates}

API สนับสนุนสำหรับเครื่องมือสร้างมีม

| Method | Path | สิทธิ์เข้าถึง | คำอธิบาย |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | ยืนยันตัวตน | แสดงรายการเทมเพลตมีมที่มีทั้งหมดพร้อมตำแหน่งกล่องข้อความ |
| `GET` | `/api/v1/meme-templates/full/:filename` | ยืนยันตัวตน | ให้บริการรูปภาพเทมเพลตขนาดเต็ม |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | ยืนยันตัวตน | ให้บริการภาพขนาดย่อของเทมเพลต |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | ยืนยันตัวตน | ให้บริการไฟล์ฟอนต์ที่ใช้สำหรับการเรนเดอร์ข้อความมีม |

## การตอบกลับข้อผิดพลาด {#error-responses}

ข้อผิดพลาดทั้งหมดคืนค่าเป็น JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| สถานะ | ความหมาย |
|--------|---------|
| 400 | คำขอไม่ถูกต้อง / การตรวจสอบล้มเหลว |
| 401 | ยังไม่ได้ยืนยันตัวตน |
| 403 | สิทธิ์ไม่เพียงพอ |
| 404 | ไม่พบทรัพยากร |
| 413 | ไฟล์ใหญ่เกินไป (ดู `MAX_UPLOAD_SIZE_MB`) |
| 422 | การประมวลผลล้มเหลวหลังการตรวจสอบ |
| 429 | ถูกจำกัดอัตรา (ดู `RATE_LIMIT_PER_MIN`) |
| 501 | ไม่ได้ติดตั้ง AI feature bundle ที่จำเป็น (`FEATURE_NOT_INSTALLED`) |
| 500 | ข้อผิดพลาดภายในเซิร์ฟเวอร์ |
