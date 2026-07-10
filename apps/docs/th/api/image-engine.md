---
description: "เอกสารอ้างอิงการทำงานของเอนจินภาพ การประมวลผลภาพที่อิง Sharp ทั้งหมดและพารามิเตอร์ของแต่ละอย่าง"
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: e7056568e7b1
---

# เอนจินภาพ {#image-engine}

แพ็กเกจ `@snapotter/image-engine` จัดการการทำงานกับภาพที่ไม่ใช่ AI ทั้งหมด มันห่อหุ้ม [Sharp](https://sharp.pixelplumbing.com/) และทำงานทั้งหมดในกระบวนการโดยไม่มี dependency ภายนอก

## การทำงาน {#operations}

### resize {#resize}

ปรับขนาดภาพให้เป็นมิติที่กำหนดหรือเป็นเปอร์เซ็นต์

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `width` | number | ความกว้างเป้าหมายเป็นพิกเซล |
| `height` | number | ความสูงเป้าหมายเป็นพิกเซล |
| `fit` | string | `cover`, `contain`, `fill`, `inside` หรือ `outside` |
| `withoutEnlargement` | boolean | หากเป็น true จะไม่ขยายภาพที่เล็กกว่า |
| `percentage` | number | ปรับขนาดตามเปอร์เซ็นต์แทนมิติสัมบูรณ์ |

คุณสามารถกำหนด `width`, `height` หรือทั้งสองอย่าง หากกำหนดเพียงอย่างเดียว อีกอย่างจะถูกคำนวณเพื่อรักษาอัตราส่วนภาพ

### crop {#crop}

ตัดบริเวณรูปสี่เหลี่ยมออกจากภาพ

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `left` | number | ระยะเยื้อง X จากขอบซ้าย |
| `top` | number | ระยะเยื้อง Y จากขอบบน |
| `width` | number | ความกว้างของพื้นที่ครอบตัด |
| `height` | number | ความสูงของพื้นที่ครอบตัด |
| `unit` | string | `px` (ค่าเริ่มต้น) หรือ `percent` |

### rotate {#rotate}

หมุนภาพตามมุมที่กำหนด

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `angle` | number | มุมการหมุนเป็นองศา (0-360) |
| `background` | string | สีเติมสำหรับพื้นที่ที่เปิดเผย (ค่าเริ่มต้น: `#000000`) ใช้กับมุมที่ไม่ใช่ 90 องศาเท่านั้น |

### flip {#flip}

สะท้อนภาพในแนวนอน แนวตั้ง หรือทั้งสองอย่าง อย่างน้อยหนึ่งอย่างต้องเป็น true

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `horizontal` | boolean | สะท้อนจากซ้ายไปขวา |
| `vertical` | boolean | สะท้อนจากบนลงล่าง |

### convert {#convert}

เปลี่ยนรูปแบบของภาพ

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `format` | string | รูปแบบเป้าหมาย: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | คุณภาพการบีบอัด (1-100 ใช้กับรูปแบบที่สูญเสียข้อมูล) |

เจ็ดรูปแบบแรก (`jpg` ถึง `jxl`) ถูกเข้ารหัสโดย Sharp ในกระบวนการ รูปแบบที่เหลือใช้ตัวเข้ารหัสภายนอกที่ชั้น API: `heic`/`heif` ผ่าน heif-enc, `bmp`/`ico` ผ่าน ImageMagick, `jp2` ผ่าน opj_compress และ `qoi` ผ่าน codec แบบ TypeScript ในโค้ด

### compress {#compress}

ลดขนาดไฟล์โดยยังคงรูปแบบเดิม

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `quality` | number | คุณภาพเป้าหมาย (1-100) |
| `targetSizeBytes` | number | ขนาดไฟล์เป้าหมายแบบเสริมเป็นไบต์ |
| `format` | string | การแทนที่รูปแบบแบบเสริม |

### strip-metadata {#strip-metadata}

ลบเมทาดาทา EXIF, IPTC, XMP และ ICC ออกจากภาพ หากไม่มีพารามิเตอร์ (หรือ `stripAll: true`) จะลบทุกอย่าง ส่งแฟล็กแต่ละตัวเพื่อการลบแบบเลือกได้

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `stripAll` | boolean | ลบเมทาดาทาทั้งหมด (ค่าเริ่มต้นเมื่อไม่ได้ตั้งแฟล็กใด ๆ) |
| `stripExif` | boolean | ลบข้อมูล EXIF (รวมถึง GPS หาก `stripGps` ไม่ได้ตั้งแยกต่างหาก) |
| `stripGps` | boolean | ลบข้อมูลตำแหน่ง GPS |
| `stripIcc` | boolean | ลบโปรไฟล์สี ICC |
| `stripXmp` | boolean | ลบเมทาดาทา XMP |

### การปรับสี {#color-adjustments}

การทำงานเหล่านี้ปรับเปลี่ยนคุณสมบัติสีของภาพ แต่ละอย่างรับค่าตัวเลขเดียว

| การทำงาน | พารามิเตอร์ | ช่วง | คำอธิบาย |
|---|---|---|---|
| `brightness` | `value` | -100 ถึง 100 | ปรับความสว่าง |
| `contrast` | `value` | -100 ถึง 100 | ปรับคอนทราสต์ |
| `saturation` | `value` | -100 ถึง 100 | ปรับความอิ่มตัวของสี |

### ฟิลเตอร์สี {#color-filters}

ฟิลเตอร์เหล่านี้ใช้การแปลงสีแบบตายตัว ไม่รับพารามิเตอร์

| การทำงาน | คำอธิบาย |
|---|---|
| `grayscale` | แปลงเป็นโทนสีเทา |
| `sepia` | ใช้โทนสีซีเปีย |
| `invert` | กลับสีทั้งหมด |

### ช่องสี {#color-channels}

ปรับช่องสี RGB แต่ละช่อง ค่าเป็นตัวคูณโดยที่ 100 = ไม่เปลี่ยนแปลง

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `red` | number | ตัวคูณช่องสีแดง (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |
| `green` | number | ตัวคูณช่องสีเขียว (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |
| `blue` | number | ตัวคูณช่องสีน้ำเงิน (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |

### sharpen {#sharpen}

การเพิ่มความคมชัดอย่างง่ายที่ควบคุมด้วยค่าเดียว

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `value` | number | ความเข้มของการเพิ่มความคมชัด (0 ถึง 100) แมปไปยังค่า Gaussian sigma ที่ 0.5-10 |

### sharpen-advanced {#sharpen-advanced}

การเพิ่มความคมชัดขั้นสูงพร้อมสามวิธีที่เลือกได้และการลดสัญญาณรบกวนล่วงหน้าแบบเสริม

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask` หรือ `high-pass` |
| `sigma` | number | รัศมี Gaussian blur, 0.5-10 (ปรับตัวได้) |
| `m1` | number | การเพิ่มความคมชัดในพื้นที่เรียบ, 0-10 (ปรับตัวได้) |
| `m2` | number | การเพิ่มความคมชัดในพื้นที่ที่มีพื้นผิว, 0-20 (ปรับตัวได้) |
| `x1` | number | เกณฑ์พื้นที่เรียบ/หยัก, 0-10 (ปรับตัวได้) |
| `y2` | number | การเพิ่มความสว่างสูงสุด (จำกัด halo), 0-50 (ปรับตัวได้) |
| `y3` | number | การลดความสว่างสูงสุด (จำกัด halo), 0-50 (ปรับตัวได้) |
| `amount` | number | เปอร์เซ็นต์ความเข้ม, 0-500 (unsharp-mask) |
| `radius` | number | รัศมีการเบลอ, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | ความสว่างขอบต่ำสุด, 0-255 (unsharp-mask) |
| `strength` | number | ความเข้มของการผสม, 0-100 (high-pass) |
| `kernelSize` | number | `3` หรือ `5` สำหรับ kernel 3x3 / 5x5 (high-pass) |
| `denoise` | string | การลดสัญญาณรบกวนล่วงหน้า: `off`, `light`, `medium` หรือ `strong` |

พารามิเตอร์เป็นแบบเฉพาะวิธี ให้ระบุเฉพาะพารามิเตอร์ที่เกี่ยวข้องกับวิธีที่เลือกเท่านั้น

### color-blindness {#color-blindness}

จำลองภาวะบกพร่องในการมองเห็นสีโดยใช้เมทริกซ์การรวมสีขนาด 3x3

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `type` | string | หนึ่งใน: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

เขียนหรือลบฟิลด์เมทาดาทา EXIF/IPTC แต่ละฟิลด์โดยไม่ต้องลบทั้งบล็อก

| พารามิเตอร์ | ชนิด | คำอธิบาย |
|---|---|---|
| `artist` | string | แท็ก EXIF Artist |
| `copyright` | string | แท็ก EXIF Copyright |
| `imageDescription` | string | แท็ก EXIF ImageDescription |
| `software` | string | แท็ก EXIF Software |
| `dateTime` | string | แท็ก EXIF DateTime |
| `dateTimeOriginal` | string | แท็ก EXIF DateTimeOriginal |
| `clearGps` | boolean | ลบแท็ก GPS ทั้งหมด |
| `fieldsToRemove` | string[] | รายการชื่อฟิลด์ EXIF ที่จะลบ |

พารามิเตอร์ทั้งหมดเป็นแบบเสริม ฟิลด์ที่ระบุใน `fieldsToRemove` จะถูกลบออกจากบล็อก EXIF ที่มีอยู่ ฟิลด์ที่ตั้งค่าผ่านพารามิเตอร์ที่มีชื่อจะถูกเขียน (หรือเขียนทับ) คีย์แบบไบนารี/ไม่ปลอดภัยอย่าง MakerNote จะถูกละเว้นโดยไม่แจ้ง

## การตรวจจับรูปแบบ {#format-detection}

เอนจินตรวจจับรูปแบบอินพุตโดยอัตโนมัติจากส่วนหัวของไฟล์ ไม่ใช่แค่นามสกุลไฟล์ นี่หมายความว่าไฟล์ `.jpg` ที่จริง ๆ เป็น PNG จะถูกจัดการอย่างถูกต้อง การตรวจจับใช้แนวทางหลายชั้น: magic bytes ก่อน จากนั้นใช้นามสกุลไฟล์เป็น fallback

SnapOtter รองรับ **รูปแบบอินพุตกว่า 55 รูปแบบ** และ **รูปแบบผลลัพธ์ 13 รูปแบบ** รวมถึงรูปแบบ RAW จากกล้อง 23 รูปแบบจากกว่า 20 แบรนด์ รูปแบบมืออาชีพ (PSD, EPS, OpenEXR, HDR) codec สมัยใหม่ (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) และรูปแบบทางวิทยาศาสตร์/เกม (FITS, DDS) การถอดรหัสจัดการโดย Sharp โดยตรงเมื่อทำได้ พร้อม fallback อัตโนมัติไปยัง ImageMagick, LibRaw และตัวถอดรหัส CLI เฉพาะทาง

ดูหน้า [Supported Formats](/th/guide/supported-formats) สำหรับรายการทั้งหมด

## การสกัดเมทาดาทา {#metadata-extraction}

เครื่องมือ `info` คืนเมทาดาทาของภาพ ดู [Image Info](/th/tools/image/info) สำหรับเอกสารอ้างอิงฟิลด์ทั้งหมด

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
