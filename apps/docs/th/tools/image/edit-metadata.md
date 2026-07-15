---
description: "แก้ไขฟิลด์เมทาดาทา EXIF, IPTC, GPS และ XMP ในภาพโดยไม่ต้องเข้ารหัสพิกเซลใหม่"
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 44bdc9fac5c5
---

# แก้ไขข้อมูลเมตาของภาพ {#edit-metadata}

แก้ไขฟิลด์เมทาดาทาของภาพรวมถึง EXIF, IPTC, พิกัด GPS, วันที่ และคีย์เวิร์ด ใช้ ExifTool เบื้องหลัง ดังนั้นเมทาดาทาจึงถูกเขียนแบบในตำแหน่งเดิมโดยไม่ต้องเข้ารหัสพิกเซลใหม่ รักษาคุณภาพภาพเต็มรูปแบบเอาไว้

## API Endpoints {#api-endpoints}

### Edit Metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

เขียนฟิลด์เมทาดาทาลงในภาพและส่งคืนไฟล์ที่แก้ไขแล้ว

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

ส่งคืนเมทาดาทาทั้งหมดจากภาพผ่าน ExifTool เป็น JSON ไม่แก้ไขภาพ

## Parameters (Edit) {#parameters-edit}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | ชื่อภาพ (XMP/EXIF) |
| author | string | No | - | ชื่อผู้สร้าง |
| artist | string | No | - | ชื่อศิลปิน (แท็ก EXIF Artist) |
| copyright | string | No | - | ประกาศลิขสิทธิ์ |
| imageDescription | string | No | - | คำอธิบายภาพ (EXIF) |
| software | string | No | - | แท็กซอฟต์แวร์ |
| dateTime | string | No | - | ค่า EXIF DateTime |
| dateTimeOriginal | string | No | - | ค่า EXIF DateTimeOriginal |
| setAllDates | string | No | - | ตั้งค่าฟิลด์วันที่ทั้งหมดพร้อมกัน |
| dateShift | string | No | - | เลื่อนวันที่ทั้งหมดด้วยออฟเซ็ต (รูปแบบ: `+HH:MM` หรือ `-HH:MM`) |
| clearGps | boolean | No | `false` | ลบข้อมูล GPS ทั้งหมด |
| gpsLatitude | number | No | - | ตั้งค่าละติจูด GPS (-90 ถึง 90) |
| gpsLongitude | number | No | - | ตั้งค่าลองจิจูด GPS (-180 ถึง 180) |
| gpsAltitude | number | No | - | ตั้งค่าความสูง GPS เป็นเมตร |
| keywords | string[] | No | - | คีย์เวิร์ด/แท็กที่จะเพิ่มหรือตั้งค่า |
| keywordsMode | string | No | `"add"` | วิธีจัดการคีย์เวิร์ด: `add` (ต่อท้าย) หรือ `set` (แทนที่) |
| fieldsToRemove | string[] | No | `[]` | รายชื่อฟิลด์เมทาดาทาเฉพาะที่จะลบ |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Example Request {#example-request}

ตั้งค่าผู้สร้างและลิขสิทธิ์:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

ตั้งค่าพิกัด GPS:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

ลบ GPS และเพิ่มคีย์เวิร์ด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

ตรวจสอบเมทาดาทา:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Edit) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notes {#notes}

- เครื่องมือนี้ต้องติดตั้ง ExifTool บนเซิร์ฟเวอร์ ซึ่งรวมอยู่ในอิมเมจ Docker
- เมทาดาทาถูกเขียนแบบในตำแหน่งเดิม จึงไม่มีการเข้ารหัสพิกเซลใหม่ ขนาดไฟล์เปลี่ยนแปลงน้อยมาก (เพียงไบต์ของเมทาดาทา)
- พารามิเตอร์ `dateShift` เลื่อนฟิลด์วันที่ทั้งหมดด้วยออฟเซ็ตที่ระบุ มีประโยชน์สำหรับการแก้ไขข้อผิดพลาดเรื่องเขตเวลา (เช่น `+02:00` หรือ `-05:30`)
- หากไม่มีการร้องขอการเปลี่ยนแปลง (ละเว้นหรือปล่อยว่างพารามิเตอร์ทั้งหมด) ไฟล์ต้นฉบับจะถูกส่งคืนโดยไม่เปลี่ยนแปลง
- รูปแบบที่รองรับ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF
- สำหรับรูปแบบที่ไม่สามารถแสดงตัวอย่างในเบราว์เซอร์ได้ (HEIF, TIFF) การตอบสนองจะรวมฟิลด์ `previewUrl` พร้อมตัวอย่าง WebP
