---
description: "ปรับแต่งรูปภาพให้เหมาะกับการส่งผ่านเว็บด้วยการแปลงรูปแบบ ควบคุมคุณภาพ ปรับขนาด และลบเมทาดาทา"
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: b756224c0dea
---

# Optimize for Web {#optimize-for-web}

ปรับแต่งรูปภาพให้เหมาะกับการส่งผ่านเว็บในขั้นตอนเดียว รวมการแปลงรูปแบบ การปรับคุณภาพ การปรับขนาดตามต้องการ การเข้ารหัสแบบ progressive และการลบเมทาดาทา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

รับ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

ยังมี endpoint สำหรับพรีวิวแบบสดที่ `POST /api/v1/tools/image/optimize-for-web/preview` ซึ่งคืนค่ารูปภาพที่ประมวลผลแล้วโดยตรงในรูปแบบไบนารี (ไม่มีการสร้าง workspace) สำหรับการปรับพารามิเตอร์แบบเรียลไทม์

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"webp"` | รูปแบบเอาต์พุต: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | No | `80` | คุณภาพเอาต์พุต (1-100) |
| maxWidth | number | No | - | ความกว้างสูงสุดเป็นพิกเซล รูปภาพจะถูกลดขนาดลงหากกว้างกว่านี้ |
| maxHeight | number | No | - | ความสูงสูงสุดเป็นพิกเซล รูปภาพจะถูกลดขนาดลงหากสูงกว่านี้ |
| progressive | boolean | No | `true` | เปิดใช้การเข้ารหัสแบบ progressive/interlaced |
| stripMetadata | boolean | No | `true` | ลบเมทาดาทา EXIF, GPS, ICC และ XMP |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

ปรับแต่งเป็น AVIF ด้วยการบีบอัดแบบเข้มข้น:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

endpoint สำหรับพรีวิว (`/api/v1/tools/image/optimize-for-web/preview`) คืนค่ารูปภาพไบนารีโดยตรงพร้อมส่วนหัวข้อมูล:

- `X-Original-Size` - ขนาดไฟล์ต้นฉบับเป็นไบต์
- `X-Processed-Size` - ขนาดไฟล์ที่ประมวลผลแล้วเป็นไบต์
- `X-Output-Filename` - ชื่อไฟล์เอาต์พุตที่เข้ารหัสแบบ URL

## Notes {#notes}

- เครื่องมือนี้ออกแบบมาเป็นไปป์ไลน์ปรับแต่งครบวงจรสำหรับแอสเซตเว็บ จัดการการแปลงรูปแบบ การปรับคุณภาพ การจำกัดขนาดสูงสุด และการลบเมทาดาทาในรอบเดียว
- นามสกุลของชื่อไฟล์เอาต์พุตจะถูกอัปเดตให้ตรงกับรูปแบบที่เลือก
- การเข้ารหัส JXL (JPEG XL) ใช้ตัวเข้ารหัส CLI เฉพาะทาง รูปภาพจะถูกประมวลผลเป็น PNG ก่อน แล้วจึงเข้ารหัสเป็น JXL
- การเข้ารหัสแบบ progressive ช่วยปรับปรุงเวลาโหลดที่รับรู้ได้สำหรับ JPEG และ PNG โดยเปิดให้เบราว์เซอร์เรนเดอร์พรีวิวคุณภาพต่ำก่อนที่รูปภาพเต็มจะโหลดเสร็จ
- endpoint สำหรับพรีวิวมีน้ำหนักเบากว่า (ไม่มีการสร้าง workspace/job) และมีไว้สำหรับ UI ปรับพารามิเตอร์แบบสดของฟรอนต์เอนด์
