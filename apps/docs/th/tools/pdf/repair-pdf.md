---
description: "พยายามซ่อมแซม PDF ที่เสียหายหรือชำรุด"
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: d739f1435af2
---

# Repair PDF {#repair-pdf}

พยายามซ่อมแซม PDF ที่เสียหายหรือชำรุดโดยการสร้างโครงสร้างภายในขึ้นใหม่

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF ไม่จำเป็นต้องมีฟิลด์ `settings`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์ PDF ที่เสียหายได้โดยตรง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- การตรวจสอบความถูกต้องของโครงสร้างจะถูกข้ามในอินพุต เพื่อให้ไฟล์ที่ผิดรูปแบบผ่านเข้ามาได้
- การซ่อมแซมเป็นแบบพยายามให้ดีที่สุด ไฟล์ที่เสียหายรุนแรงอาจกู้คืนได้ไม่สมบูรณ์
- PDF ที่ซ่อมแซมแล้วอาจมีขนาดแตกต่างจากต้นฉบับเล็กน้อยเนื่องจากตารางอ้างอิงข้ามที่สร้างขึ้นใหม่
