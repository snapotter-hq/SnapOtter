---
description: "เพิ่มเอฟเฟกต์ vignette พร้อมปรับความแรง สี และตำแหน่งได้"
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: e9342cffd091
---

# Vignette {#vignette}

เพิ่มเอฟเฟกต์ vignette ที่ทำให้ขอบภาพเข้มขึ้นหรือย้อมสี รองรับการปรับความแรง สี รัศมี ความนุ่มนวล ความกลม และตำแหน่งจุดศูนย์กลาง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vignette`

รับ multipart form data พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | number | No | `0.5` | ความทึบของ vignette (0.1-1) |
| color | string | No | `"#000000"` | สี vignette แบบ hex |
| radius | integer | No | `70` | รัศมีด้านนอกเป็นเปอร์เซ็นต์ของครึ่งเส้นทแยงมุม (0-100) |
| softness | integer | No | `50` | ความนุ่มนวลของขอบเบลอ (0-100) ค่ายิ่งสูงยิ่งไล่จางลงอย่างค่อยเป็นค่อยไป |
| roundness | integer | No | `100` | รูปทรง: 100 = วงกลม, 0 = วงรีตามสัดส่วนภาพ |
| centerX | integer | No | `50` | ตำแหน่งจุดศูนย์กลางแนวนอนเป็นเปอร์เซ็นต์ (0-100) |
| centerY | integer | No | `50` | ตำแหน่งจุดศูนย์กลางแนวตั้งเป็นเปอร์เซ็นต์ (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notes {#notes}

- ค่า `radius` ที่เล็กลงจะทำให้ภาพเข้มขึ้นมากขึ้น ส่วนรัศมีที่ใหญ่ขึ้นจะจำกัด vignette ไว้ที่ขอบสุดๆ
- ใช้ `color` ที่ไม่ใช่สีดำ (เช่น สีขาวหรือเฉดสีซีเปีย) เพื่อสร้างเอฟเฟกต์ vignette เชิงสร้างสรรค์
- การปรับ `centerX` และ `centerY` ช่วยให้คุณวางพื้นที่ใสไว้นอกจุดศูนย์กลางได้ มีประโยชน์ในการดึงความสนใจไปยังวัตถุที่ไม่ได้อยู่กลางเฟรม
- รูปแบบผลลัพธ์จะตรงกับรูปแบบไฟล์ต้นฉบับ ไฟล์ HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
