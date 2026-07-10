---
description: "รวมภาพหลายภาพเข้าเป็น sprite sheet แบบตารางเดียว พร้อมเมทาดาทาของแต่ละเฟรม"
i18n_source_hash: 1938d7fb100d
i18n_provenance: human
i18n_output_hash: 73e3f2313606
---

# Sprite Sheet {#sprite-sheet}

รวมภาพหลายภาพเข้าเป็น sprite sheet แบบตารางเดียว แต่ละภาพจะถูกปรับขนาดให้ตรงกับขนาดของภาพแรก แล้ววางลงในตาราง คืนค่าเป็นภาพ sprite sheet พร้อมเมทาดาทาพิกัดของแต่ละเฟรม

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sprite-sheet`

รับ multipart form data พร้อมไฟล์ภาพตั้งแต่สองไฟล์ขึ้นไปและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | `4` | จำนวนคอลัมน์ในตาราง (1-16) |
| padding | integer | No | `0` | ระยะห่างระหว่างเซลล์เป็นพิกเซล (0-64) |
| background | string | No | `"#ffffff"` | สีพื้นหลังแบบ hex |
| format | string | No | `"png"` | รูปแบบผลลัพธ์: `png`, `webp` หรือ `jpeg` |
| quality | integer | No | `90` | คุณภาพผลลัพธ์ (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sprite-sheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F "file=@frame4.png" \
  -F 'settings={"columns": 2, "padding": 4, "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sprite-sheet.png",
  "originalSize": 120000,
  "processedSize": 95000,
  "frames": [
    { "index": 0, "left": 0, "top": 0, "width": 128, "height": 128 },
    { "index": 1, "left": 132, "top": 0, "width": 128, "height": 128 },
    { "index": 2, "left": 0, "top": 132, "width": 128, "height": 128 },
    { "index": 3, "left": 132, "top": 132, "width": 128, "height": 128 }
  ],
  "cols": 2,
  "rows": 2,
  "cellWidth": 128,
  "cellHeight": 128,
  "canvasWidth": 260,
  "canvasHeight": 260
}
```

## Notes {#notes}

- รับภาพได้ 2 ถึง 64 ภาพ ทุกภาพจะถูกปรับขนาดให้ตรงกับขนาดของภาพแรกที่อัปโหลด
- อาร์เรย์ `frames` ให้พิกัดพิกเซลที่แม่นยำของแต่ละเฟรมในผลลัพธ์ เหมาะสำหรับการกำหนด CSS sprite หรือ frame map ของเกมเอนจิน
- จำนวนแถวจะคำนวณโดยอัตโนมัติจากจำนวนภาพและค่า `columns`
- ใช้พารามิเตอร์ `padding` เพื่อเพิ่มระยะห่างระหว่างเซลล์ สี `background` จะมองเห็นได้ในพื้นที่ระยะขอบและเซลล์ท้ายที่ว่างเปล่า
- ไฟล์ HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
