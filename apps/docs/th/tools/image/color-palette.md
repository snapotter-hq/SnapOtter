---
description: "สกัดสีเด่นจากภาพออกมาเป็นชุดสี"
i18n_source_hash: 65ab22dd75a9
i18n_provenance: human
i18n_output_hash: accab8d2f861
---

# Color Palette {#color-palette}

สกัดสีเด่นจากภาพและส่งคืนเป็นค่าสี hex ใช้การวิเคราะห์ความถี่แบบควอนไทซ์เพื่อระบุสีที่โดดเด่นที่สุดและแตกต่างกันชัดเจนที่สุดในเชิงสายตา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-palette`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| count | integer | No | `8` | จำนวนสีที่จะสกัด (2-16) |
| format | string | No | `"hex"` | รูปแบบสี: `hex`, `rgb`, `hsl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-palette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"count": 6, "format": "hex"}'
```

## Example Response {#example-response}

```json
{
  "filename": "photo.jpg",
  "colors": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "hex": [
    "#304080",
    "#e0a060",
    "#f0f0f0",
    "#203020",
    "#a0c0e0",
    "#806040"
  ],
  "count": 6
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | ชื่อไฟล์ที่ผ่านการทำความสะอาดแล้ว |
| colors | array | อาร์เรย์ของสตริงสีในรูปแบบที่ร้องขอ เรียงตามความเด่น (พบบ่อยที่สุดก่อน) |
| hex | array | อาร์เรย์ของสตริงสี hex (เป็น hex เสมอ ไม่ว่าการตั้งค่า `format` จะเป็นอะไร) |
| count | number | จำนวนสีที่สกัดได้ |

## Notes {#notes}

- ส่งคืนสีเด่นได้สูงสุด `count` สี (ค่าเริ่มต้น 8, ช่วง 2-16) เรียงตามความถี่ (พบบ่อยที่สุดก่อน)
- ภาพจะถูกปรับขนาดภายในเป็น 100x100 พิกเซลเพื่อการวิเคราะห์ ดังนั้นชุดสีจึงแทนการกระจายตัวของสีโดยรวมมากกว่ารายละเอียดเล็ก ๆ
- สีถูกสกัดโดยใช้ median-cut quantization ซึ่งแบ่งกลุ่มพิกเซลแบบเรียกซ้ำตามช่องสัญญาณที่มีช่วงกว้างที่สุด
- ช่องสัญญาณอัลฟาจะถูกลบออกก่อนการวิเคราะห์ ดังนั้นบริเวณโปร่งใสจึงไม่ถูกนำมาพิจารณา
- นี่เป็น endpoint แบบอ่านอย่างเดียว ไม่สร้างไฟล์เอาต์พุตที่ดาวน์โหลดได้หรือ `jobId`
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนการวิเคราะห์
