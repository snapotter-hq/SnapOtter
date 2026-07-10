---
description: "เพิ่มลายน้ำข้อความพร้อมกำหนดตำแหน่ง ความทึบ การหมุน และการทำซ้ำแบบไทล์ได้"
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: eeff5b165108
---

# Text Watermark {#text-watermark}

เพิ่มลายน้ำข้อความซ้อนทับลงบนภาพ รองรับการวางเดี่ยวที่มุม/กึ่งกลาง หรือการทำซ้ำแบบไทล์ทั่วทั้งภาพ พร้อมกำหนดขนาดฟอนต์ สี ความทึบ และการหมุนได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

รับ multipart form data พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ข้อความลายน้ำ (1 ถึง 500 อักขระ) |
| fontSize | number | No | `48` | ขนาดฟอนต์เป็นพิกเซล (8 ถึง 1000) |
| color | string | No | `"#000000"` | สีข้อความในรูปแบบ hex (`#RRGGBB`) |
| opacity | number | No | `50` | เปอร์เซ็นต์ความทึบของข้อความ (0 ถึง 100) |
| position | string | No | `"center"` | ตำแหน่ง: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | No | `0` | มุมการหมุนข้อความเป็นองศา (-360 ถึง 360) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

ลายน้ำแบบไทล์ทั่วทั้งภาพ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- ลายน้ำถูกเรนเดอร์เป็นข้อความ SVG และซ้อนลงบนภาพ เพื่อรักษาคุณภาพผลลัพธ์
- โหมดไทล์จะเว้นระยะองค์ประกอบข้อความตามขนาดฟอนต์ (ระยะแนวนอน 6 เท่า, แนวตั้ง 4 เท่า) จำกัดไว้ที่ 500 องค์ประกอบสูงสุด
- สำหรับตำแหน่งมุม ระยะขอบจากขอบภาพเท่ากับขนาดฟอนต์
- ฟอนต์ที่ใช้คือฟอนต์ sans-serif เริ่มต้นของระบบ
- อักขระพิเศษของ XML ในข้อความ (`&`, `<`, `>`, `"`, `'`) จะถูก escape อย่างปลอดภัย
- รูปแบบผลลัพธ์จะตรงกับรูปแบบไฟล์ต้นฉบับ ไฟล์ HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
