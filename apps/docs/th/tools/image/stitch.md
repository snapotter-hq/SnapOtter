---
description: "ต่อภาพเข้าด้วยกันแบบเรียงข้าง เรียงซ้อน หรือแบบตาราง พร้อมควบคุมการจัดตำแหน่ง ช่องว่าง เส้นขอบ และโหมดการปรับขนาด"
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: c557fce78939
---

# ต่อและรวมภาพ {#stitch-combine}

ต่อภาพหลายภาพเข้าด้วยกันแบบเรียงข้าง เรียงซ้อนแนวตั้ง หรือจัดวางแบบตาราง รองรับการจัดตำแหน่ง ช่องว่าง เส้นขอบ รัศมีมุม และโหมดการปรับขนาดหลายรูปแบบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | ทิศทางการจัดวาง: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | จำนวนคอลัมน์เมื่อ direction เป็น `grid` (2 ถึง 100) |
| resizeMode | string | No | `"fit"` | วิธีปรับขนาดภาพ: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | การจัดตำแหน่งตามแกนขวาง: `start`, `center`, `end` |
| gap | number | No | 0 | ช่องว่างระหว่างภาพเป็นพิกเซล (0 ถึง 1000) |
| border | number | No | 0 | ความกว้างของเส้นขอบด้านนอกเป็นพิกเซล (0 ถึง 500) |
| cornerRadius | number | No | 0 | รัศมีมุมที่ใช้กับผลลัพธ์สุดท้าย (0 ถึง 500) |
| backgroundColor | string | No | `"#FFFFFF"` | สีพื้นหลัง/เส้นขอบแบบ hex (เช่น `#FF0000`) |
| format | string | No | `"png"` | รูปแบบผลลัพธ์: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | คุณภาพผลลัพธ์ (1 ถึง 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- ต้องมีภาพอย่างน้อย 2 ภาพ อัปโหลดไฟล์ภาพหลายไฟล์ในคำขอ multipart
- รองรับรูปแบบไฟล์นำเข้า HEIC, RAW, PSD และ SVG (ถอดรหัสอัตโนมัติ)
- โหมดการปรับขนาด:
  - `fit` - ปรับขนาดภาพให้ตรงกับมิติที่เล็กที่สุดตามแกนที่ต่อกัน
  - `original` - คงขนาดเดิมไว้ (อาจทำให้ขอบไม่เท่ากัน)
  - `stretch` - บังคับให้ภาพตรงกับมิติที่เล็กที่สุดโดยไม่รักษาสัดส่วนภาพ
  - `crop` - ครอปแบบครอบคลุมให้ภาพตรงกับมิติที่เล็กที่สุด
- ในโหมด `grid` เซลล์จะถูกกำหนดขนาดตามมิติค่ามัธยฐานของภาพทั้งหมด
- `cornerRadius` จะถูกนำไปใช้กับผลลัพธ์สุดท้ายทั้งหมด ไม่ใช่กับแต่ละภาพ
- ขนาดแคนวาสถูกจำกัดโดยการกำหนดค่าเซิร์ฟเวอร์ `MAX_CANVAS_PIXELS` เพื่อป้องกันการใช้หน่วยความจำจนหมด
