---
description: "ปรับขนาดรูปภาพตามพิกเซล เปอร์เซ็นต์ หรือด้วยโหมดการปรับพอดี"
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: 6672556356d0
---

# ปรับขนาดภาพ {#resize}

ปรับขนาดรูปภาพโดยระบุมิติพิกเซลที่แน่นอน ตัวคูณสเกลเป็นเปอร์เซ็นต์ หรือโหมดการปรับพอดีที่ควบคุมวิธีที่รูปภาพปรับตัวเข้ากับมิติเป้าหมาย

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/resize`

รับ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | ความกว้างเป้าหมายเป็นพิกเซล (สูงสุด 16383) |
| height | integer | No | - | ความสูงเป้าหมายเป็นพิกเซล (สูงสุด 16383) |
| fit | string | No | `"contain"` | วิธีที่รูปภาพปรับพอดีกับมิติ: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | No | `false` | ป้องกันการขยายขนาดหากรูปภาพเล็กกว่าเป้าหมาย |
| percentage | number | No | - | ปรับสเกลตามเปอร์เซ็นต์ (เช่น 50 สำหรับครึ่งขนาด) |

ต้องระบุ `width`, `height` หรือ `percentage` อย่างน้อยหนึ่งอย่าง

### Fit Modes {#fit-modes}

- **contain** - ปรับขนาดให้พอดีภายในมิติ โดยรักษาสัดส่วนภาพ (อาจเหลือพื้นที่ว่าง)
- **cover** - ปรับขนาดให้ครอบคลุมมิติ โดยรักษาสัดส่วนภาพ (อาจครอป)
- **fill** - ยืดให้ตรงกับมิติพอดี (ละเว้นสัดส่วนภาพ)
- **inside** - เหมือน `contain` แต่ลดขนาดเท่านั้น ไม่ขยาย
- **outside** - เหมือน `cover` แต่ลดขนาดเท่านั้น ไม่ขยาย

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

ปรับขนาดตามเปอร์เซ็นต์:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- มิติสูงสุดคือ 16383 พิกเซลในแต่ละแกน (ขีดจำกัดของ Sharp/libvips)
- รูปแบบเอาต์พุตจะตรงกับรูปแบบอินพุต อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสโดยอัตโนมัติก่อนการประมวลผล
- การวางแนวตาม EXIF จะถูกใช้โดยอัตโนมัติก่อนการปรับขนาด
- แฟล็ก `withoutEnlargement` มีประโยชน์สำหรับการประมวลผลแบบกลุ่มที่รูปภาพบางส่วนอาจเล็กกว่าเป้าหมายอยู่แล้ว
