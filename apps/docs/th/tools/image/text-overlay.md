---
description: "เพิ่มข้อความซ้อนทับที่จัดสไตล์แล้วพร้อมเงาตกกระทบและกล่องพื้นหลัง"
i18n_source_hash: 9f8e697188fc
i18n_provenance: human
i18n_output_hash: ee3b4069d38e
---

# Text Overlay {#text-overlay}

เพิ่มข้อความที่จัดสไตล์แล้วลงบนภาพพร้อมเงาตกกระทบและกล่องพื้นหลังกึ่งโปร่งใสตามต้องการ เหมาะสำหรับหัวเรื่อง คำบรรยาย หรือคำอธิบายบนภาพถ่าย

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/text-overlay`

รับ multipart form data พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ข้อความที่จะซ้อนทับ (1 ถึง 500 อักขระ) |
| fontSize | number | No | `48` | ขนาดฟอนต์เป็นพิกเซล (8 ถึง 200) |
| color | string | No | `"#FFFFFF"` | สีข้อความในรูปแบบ hex (`#RRGGBB`) |
| position | string | No | `"bottom"` | ตำแหน่งแนวตั้ง: `top`, `center`, `bottom` |
| backgroundBox | boolean | No | `false` | แสดงสี่เหลี่ยมพื้นหลังกึ่งโปร่งใสด้านหลังข้อความ |
| backgroundColor | string | No | `"#000000"` | สีกล่องพื้นหลังในรูปแบบ hex (`#RRGGBB`) |
| shadow | boolean | No | `true` | ใส่เงาตกกระทบด้านหลังข้อความ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Hello World", "fontSize": 64, "color": "#FFFFFF", "position": "bottom", "shadow": true}'
```

พร้อมกล่องพื้นหลัง:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/text-overlay \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "Caption", "fontSize": 36, "position": "bottom", "backgroundBox": true, "backgroundColor": "#000000"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- ข้อความจะจัดกึ่งกลางในแนวนอนภายในภาพเสมอ
- เงาตกกระทบใช้ระยะเยื้อง 2px พร้อมเบลอ 3px ที่ความทึบสีดำ 70%
- กล่องพื้นหลังครอบคลุมความกว้างเต็มภาพที่ความทึบ 70% โดยความสูงเป็นสัดส่วนกับขนาดฟอนต์ (1.8 เท่า)
- ข้อความถูกเรนเดอร์ผ่านการซ้อน SVG จึงใช้ฟอนต์ sans-serif เริ่มต้นของระบบ
- อักขระพิเศษของ XML ในข้อความจะถูก escape อย่างปลอดภัย
- รูปแบบผลลัพธ์จะตรงกับรูปแบบไฟล์ต้นฉบับ ไฟล์ HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
