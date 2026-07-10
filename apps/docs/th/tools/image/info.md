---
description: "ดูเมทาดาทาของภาพ คุณสมบัติ และสถิติ histogram ต่อช่องสัญญาณอย่างละเอียด"
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: b49f60ebee62
---

# Image Info {#image-info}

เครื่องมือวิเคราะห์แบบอ่านอย่างเดียวที่คืนค่าเมทาดาทาของภาพอย่างครบถ้วน รวมถึงขนาด รูปแบบ พื้นที่สี การมีอยู่ของ EXIF/ICC/XMP และสถิติ histogram ต่อช่องสัญญาณ ไม่ผลิตไฟล์ผลลัพธ์ที่ประมวลผลแล้ว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/info`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพ ไม่จำเป็นต้องมีฟิลด์การตั้งค่า

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ เพียงอัปโหลดไฟล์ภาพ

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | file | Yes | ภาพที่จะวิเคราะห์ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

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
  "orientation": 1,
  "hasProfile": true,
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

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | ชื่อไฟล์ที่ทำความสะอาดแล้ว |
| fileSize | number | ขนาดไฟล์เป็นไบต์ |
| width | number | ความกว้างของภาพเป็นพิกเซล |
| height | number | ความสูงของภาพเป็นพิกเซล |
| format | string | รูปแบบที่ตรวจพบ (jpeg, png, webp เป็นต้น) |
| channels | number | จำนวนช่องสัญญาณสี |
| hasAlpha | boolean | ว่าภาพมีช่อง alpha หรือไม่ |
| colorSpace | string | พื้นที่สี (srgb, cmyk เป็นต้น) |
| density | number or null | ความละเอียด DPI/PPI |
| isProgressive | boolean | ว่า JPEG ใช้การเข้ารหัสแบบ progressive หรือไม่ |
| orientation | number or null | ค่าทิศทาง EXIF (1-8) |
| hasProfile | boolean | ว่ามีการฝัง ICC profile หรือไม่ |
| hasExif | boolean | ว่ามีเมทาดาทา EXIF หรือไม่ |
| hasIcc | boolean | ว่ามี ICC color profile หรือไม่ |
| hasXmp | boolean | ว่ามีเมทาดาทา XMP หรือไม่ |
| bitDepth | string or null | บิตต่อตัวอย่าง |
| pages | number | จำนวนหน้า (สำหรับรูปแบบหลายหน้าเช่น TIFF, GIF) |
| histogram | array | สถิติต่อช่องสัญญาณ (ค่าต่ำสุด สูงสุด ค่าเฉลี่ย ส่วนเบี่ยงเบนมาตรฐาน) |

## Notes {#notes}

- นี่คือ endpoint แบบอ่านอย่างเดียว ไม่ผลิตไฟล์ผลลัพธ์ที่ดาวน์โหลดได้หรือ `jobId`
- สำหรับภาพรูปแบบ RAW (DNG, CR2, NEF, ARW เป็นต้น) จะใช้ ExifTool เพื่อดึงขนาดเซนเซอร์ที่แท้จริงและ flag เมทาดาทาที่ Sharp อ่านโดยตรงไม่ได้
- ไฟล์ HEIC/HEIF จะถูกถอดรหัสเป็น PNG ภายในเพื่อดึงสถิติพิกเซล เนื่องจาก Sharp ไม่สามารถถอดรหัสพิกเซล HEVC ได้
- histogram ให้ค่าต่ำสุด/สูงสุด/เฉลี่ย/ส่วนเบี่ยงเบนมาตรฐานต่อช่องสัญญาณ ไม่ใช่การกระจายแบบ 256 bin เต็ม
- ฟิลด์ `density` สะท้อนเมทาดาทา DPI ที่ฝังอยู่ หากมี
