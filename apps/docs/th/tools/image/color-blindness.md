---
description: "จำลองว่าภาพปรากฏอย่างไรต่อผู้ที่มีภาวะบกพร่องในการมองเห็นสีประเภทต่าง ๆ"
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 97fd9155aae2
---

# Color Blindness Simulation {#color-blindness-simulation}

จำลองภาวะบกพร่องในการมองเห็นสี (CVD) เพื่อดูตัวอย่างว่าภาพปรากฏอย่างไรต่อผู้ที่มีภาวะตาบอดสีประเภทต่าง ๆ มีประโยชน์สำหรับการทดสอบการเข้าถึงของงานออกแบบ แผนภูมิ และ UI

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | ประเภทของภาวะบกพร่องในการมองเห็นสีที่จะจำลอง |

### Simulation Types {#simulation-types}

| Value | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | ตาบอดสีแดง | ไม่มีเซลล์รูปกรวยสีแดงเลย |
| `deuteranopia` | ตาบอดสีเขียว | ไม่มีเซลล์รูปกรวยสีเขียวเลย |
| `tritanopia` | ตาบอดสีน้ำเงิน | ไม่มีเซลล์รูปกรวยสีน้ำเงินเลย |
| `protanomaly` | มองเห็นสีแดงอ่อน | ความไวต่อเซลล์รูปกรวยสีแดงลดลง |
| `deuteranomaly` | มองเห็นสีเขียวอ่อน | ความไวต่อเซลล์รูปกรวยสีเขียวลดลง (พบบ่อยที่สุด) |
| `tritanomaly` | มองเห็นสีน้ำเงินอ่อน | ความไวต่อเซลล์รูปกรวยสีน้ำเงินลดลง |
| `achromatopsia` | ตาบอดสีทั้งหมด | ไม่มีการมองเห็นสีเลย |
| `blueConeMonochromacy` | มีเฉพาะเซลล์รูปกรวยสีน้ำเงิน | มีเฉพาะเซลล์รูปกรวยสีน้ำเงินที่ทำงานได้ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- Deuteranomaly (มองเห็นสีเขียวอ่อน) เป็นค่าเริ่มต้นเพราะเป็นรูปแบบภาวะบกพร่องในการมองเห็นสีที่พบบ่อยที่สุด ส่งผลต่อผู้ชายประมาณ 6%
- การจำลองใช้เมทริกซ์การแปลงสีที่จำลองว่าการที่เซลล์รับแสงรูปกรวยลดลงหรือขาดหายไปเปลี่ยนแปลงการรับรู้สีอย่างไร
- เครื่องมือนี้ไม่ทำลายข้อมูลและสร้างเป็นเพียงตัวอย่างเท่านั้น ไม่ได้แก้ไขภาพต้นฉบับเพื่อการเข้าถึง
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
