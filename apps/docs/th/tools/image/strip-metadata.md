---
description: "ลบเมทาดาทา EXIF, GPS, ICC และ XMP ออกจากภาพเพื่อความเป็นส่วนตัวและลดขนาดไฟล์"
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 58afe13510ea
---

# ลบข้อมูลเมตาของภาพ {#remove-metadata}

ลบเมทาดาทา EXIF, GPS, โปรไฟล์สี ICC และ XMP ออกจากภาพ มีประโยชน์สำหรับความเป็นส่วนตัว (ลบพิกัด GPS, ข้อมูลกล้อง) และลดขนาดไฟล์

## API Endpoints {#api-endpoints}

### Strip Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

ประมวลผลภาพและคืนค่าเวอร์ชันที่ล้างแล้วโดยลบเมทาดาทาที่เลือกออก

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

คืนค่าเมทาดาทาที่แยกวิเคราะห์แล้วเป็น JSON โดยไม่แก้ไขภาพ มีประโยชน์สำหรับดูตัวอย่างว่ามีเมทาดาทาใดอยู่ก่อนที่จะลบ

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | ลบข้อมูล EXIF (การตั้งค่ากล้อง วันที่ ฯลฯ) |
| stripGps | boolean | No | `false` | ลบข้อมูล GPS/ตำแหน่งเท่านั้น |
| stripIcc | boolean | No | `false` | ลบโปรไฟล์สี ICC |
| stripXmp | boolean | No | `false` | ลบเมทาดาทา XMP (Adobe, IPTC) |
| stripAll | boolean | No | `true` | ลบเมทาดาทาทั้งหมดพร้อมกัน |

เมื่อ `stripAll` เป็น `true` ค่านี้จะแทนที่แฟล็กแต่ละตัวและลบทุกอย่างออก

## Example Request {#example-request}

ลบเมทาดาทาทั้งหมด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

ลบเฉพาะข้อมูล GPS (คงข้อมูลกล้องและโปรไฟล์สีไว้):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

ตรวจสอบเมทาดาทาโดยไม่แก้ไข:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notes {#notes}

- ภาพจะถูกเข้ารหัสใหม่ในรูปแบบเดิมหลังจากลบเมทาดาทา JPEG ใช้ mozjpeg ที่คุณภาพ 90, PNG ใช้ระดับการบีบอัด 9, WebP ใช้คุณภาพ 85
- การลบโปรไฟล์ ICC อาจทำให้สีเปลี่ยนเล็กน้อยหากภาพถูกแท็กด้วยโปรไฟล์ที่ไม่ใช่ sRGB ใช้ `stripIcc: false` หากความแม่นยำของสีมีความสำคัญ
- endpoint สำหรับตรวจสอบจะแยกวิเคราะห์พิกัด GPS เป็นค่าละติจูด/ลองจิจูดแบบทศนิยม (นำหน้าด้วยขีดล่าง) เพื่อความสะดวก
- รูปแบบไฟล์นำเข้าที่รองรับ: JPEG, PNG, WebP, AVIF, TIFF, GIF
