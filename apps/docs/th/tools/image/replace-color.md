---
description: "แทนที่สีเฉพาะในรูปภาพด้วยสีอื่นหรือทำให้โปร่งใส"
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: b64480b79dd5
---

# Replace & Invert Color {#replace-invert-color}

แทนที่พิกเซลที่ตรงกับสีต้นทางด้วยสีปลายทาง หรือทำให้โปร่งใส ใช้ระยะทางแบบยูคลิดในปริภูมิ RGB พร้อมค่าความคลาดเคลื่อนที่ปรับได้เพื่อการเกลี่ยที่นุ่มนวลตรงขอบเขตของสี

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

รับ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sourceColor | string | No | `"#FF0000"` | สี hex ที่จะค้นหา (รูปแบบ: `#RRGGBB`) |
| targetColor | string | No | `"#00FF00"` | สี hex ที่จะใช้แทนที่ (รูปแบบ: `#RRGGBB`) |
| makeTransparent | boolean | No | `false` | ทำให้พิกเซลที่ตรงกันโปร่งใสแทนการแทนที่ด้วยสีปลายทาง |
| tolerance | number | No | `30` | ค่าความคลาดเคลื่อนในการจับคู่สี (0 ถึง 255) ค่ายิ่งสูงยิ่งจับคู่สีที่คล้ายกันในช่วงกว้างขึ้น |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

ทำให้พื้นหลังสีเขียวโปร่งใส:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notes {#notes}

- การจับคู่สีใช้ระยะทางแบบยูคลิดในปริภูมิ RGB ปรับสเกลด้วย `tolerance * sqrt(3)`
- การเกลี่ยการแทนที่เป็นสัดส่วนกับระยะทางของสี: พิกเซลที่ใกล้สีต้นทางมากขึ้นจะได้รับสีปลายทางมากขึ้น สร้างการเปลี่ยนผ่านที่นุ่มนวล
- เมื่อ `makeTransparent` เป็น `true` เอาต์พุตจะถูกบังคับเป็น PNG (หรือ WebP/AVIF) หากรูปแบบอินพุตไม่รองรับ alpha channel (เช่น JPEG)
- ค่าความคลาดเคลื่อน 0 จะจับคู่เฉพาะสีต้นทางที่ตรงกันพอดี ค่าที่สูงกว่า (50+) จะจับคู่โทนสีที่คล้ายกันในช่วงกว้างขึ้น
- รูปแบบเอาต์พุตจะตรงกับรูปแบบอินพุต เว้นแต่จำเป็นต้องมีความโปร่งใสและรูปแบบอินพุตไม่รองรับ alpha
