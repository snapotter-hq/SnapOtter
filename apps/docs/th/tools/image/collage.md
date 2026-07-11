---
description: "รวมภาพหลายภาพเข้าเป็นคอลลาจแบบกริดด้วยเทมเพลตกว่า 25 แบบ ปรับช่องว่างและมุมได้ พร้อมแพนและซูมแยกตามแต่ละช่อง"
i18n_source_hash: 96f2055717df
i18n_provenance: human
i18n_output_hash: 1e8ce01e652b
---

# Collage / Grid {#collage-grid}

รวมภาพหลายภาพเข้าเป็นคอลลาจแบบกริดที่สวยงามด้วยเทมเพลตกว่า 25 แบบ รองรับเลย์เอาต์ตั้งแต่ 2 ถึง 9 ภาพ พร้อมปรับแต่งช่องว่าง รัศมีมุม สีพื้นหลัง และตัวควบคุมแพน/ซูมแยกตามแต่ละช่อง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/collage`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | Yes | - | ID เลย์เอาต์เทมเพลต (เช่น `2-h-equal`, `3-left-large`, `4-grid`, `9-grid`) |
| cells | array | No | - | อาร์เรย์การตั้งค่าแยกตามแต่ละช่อง พร้อม `imageIndex`, `panX`, `panY`, `zoom`, `objectFit` |
| cells[].imageIndex | integer | Yes | - | ดัชนีของภาพที่จะวางในช่องนี้ (เริ่มจาก 0) |
| cells[].panX | number | No | 0 | ระยะออฟเซ็ตแพนแนวนอน (-100 ถึง 100) |
| cells[].panY | number | No | 0 | ระยะออฟเซ็ตแพนแนวตั้ง (-100 ถึง 100) |
| cells[].zoom | number | No | 1 | ระดับการซูม (1 ถึง 10) |
| cells[].objectFit | string | No | `"cover"` | วิธีที่ภาพเติมเต็มช่อง: `cover` หรือ `contain` |
| gap | number | No | 8 | ช่องว่างระหว่างช่องเป็นพิกเซล (0 ถึง 500) |
| cornerRadius | number | No | 0 | รัศมีมุมของแต่ละช่องเป็นพิกเซล (0 ถึง 500) |
| backgroundColor | string | No | `"#FFFFFF"` | สีพื้นหลังเป็นค่า hex หรือ `"transparent"` |
| aspectRatio | string | No | `"free"` | สัดส่วนภาพของแคนวาส: `free`, `1:1`, `4:3`, `3:2`, `16:9`, `9:16`, `4:5` |
| outputFormat | string | No | `"png"` | รูปแบบเอาต์พุต: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | คุณภาพเอาต์พุต (1 ถึง 100) |

## Available Templates {#available-templates}

| Template ID | Images | Layout |
|-------------|--------|--------|
| `2-h-equal` | 2 | สองคอลัมน์เท่ากัน |
| `2-v-equal` | 2 | สองแถวเท่ากัน |
| `2-h-left-large` | 2 | ซ้าย 2/3, ขวา 1/3 |
| `2-h-right-large` | 2 | ซ้าย 1/3, ขวา 2/3 |
| `3-left-large` | 3 | ใหญ่ทางซ้าย สองภาพซ้อนกันทางขวา |
| `3-right-large` | 3 | สองภาพซ้อนกันทางซ้าย ใหญ่ทางขวา |
| `3-top-large` | 3 | ใหญ่ด้านบน สองคอลัมน์ด้านล่าง |
| `3-h-equal` | 3 | สามคอลัมน์เท่ากัน |
| `3-v-equal` | 3 | สามแถวเท่ากัน |
| `4-grid` | 4 | กริด 2x2 |
| `4-left-large` | 4 | ใหญ่ทางซ้าย สามภาพซ้อนกันทางขวา |
| `4-top-large` | 4 | ใหญ่ด้านบน สามคอลัมน์ด้านล่าง |
| `4-bottom-large` | 4 | สามคอลัมน์ด้านบน ใหญ่ด้านล่าง |
| `5-top2-bottom3` | 5 | สองภาพด้านบน สามภาพด้านล่าง |
| `5-top3-bottom2` | 5 | สามภาพด้านบน สองภาพด้านล่าง |
| `5-left-large` | 5 | ใหญ่ทางซ้าย สี่ภาพซ้อนกันทางขวา |
| `5-center-large` | 5 | ใหญ่ตรงกลาง สี่มุม |
| `6-grid-2x3` | 6 | 2 คอลัมน์ x 3 แถว |
| `6-grid-3x2` | 6 | 3 คอลัมน์ x 2 แถว |
| `6-top-large` | 6 | ใหญ่ด้านบน ห้าคอลัมน์ด้านล่าง |
| `7-mosaic` | 7 | เลย์เอาต์แบบโมเสก |
| `8-mosaic` | 8 | เลย์เอาต์แบบโมเสก |
| `9-grid` | 9 | กริด 3x3 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/collage \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"templateId":"4-grid","gap":12,"cornerRadius":8,"backgroundColor":"#F5F5F5","outputFormat":"png","quality":90}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collage.png",
  "originalSize": 2456789,
  "processedSize": 1823456
}
```

## Notes {#notes}

- อัปโหลดไฟล์ภาพหลายไฟล์ในคำขอ multipart ภาพจะถูกกำหนดให้กับช่องของเทมเพลตตามลำดับการอัปโหลด
- หากอัปโหลดภาพมากกว่าที่เทมเพลตรองรับ ภาพส่วนเกินจะถูกละเว้น
- รองรับรูปแบบอินพุต HEIC, RAW, PSD และ SVG (ถอดรหัสอัตโนมัติ)
- ขนาดฐานของแคนวาสคือ 2400px บนด้านที่ยาวที่สุด แล้วปรับตามสัดส่วนภาพที่เลือก
- เมื่อ `aspectRatio` เป็น `"free"` แคนวาสจะใช้ค่าเริ่มต้นเป็น 4:3 (2400x1800)
- ค่า `panX`/`panY` แยกตามแต่ละช่องจะเลื่อนหน้าต่างครอปภายในช่อง ค่า 100 จะเลื่อนไปสุดขอบด้านหนึ่ง และ -100 ไปอีกด้านหนึ่ง
- สีพื้นหลัง `"transparent"` จะถูกรักษาไว้เฉพาะกับรูปแบบเอาต์พุต `png`, `webp` หรือ `avif` เท่านั้น
