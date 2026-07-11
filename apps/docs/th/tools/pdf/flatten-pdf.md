---
description: "ฝังฟอร์มและคำอธิบายประกอบลงในเนื้อหาหน้า"
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 68690309ce17
---

# Flatten PDF {#flatten-pdf}

ฝังฟิลด์ฟอร์มแบบโต้ตอบและคำอธิบายประกอบลงในเนื้อหาหน้า สร้าง PDF แบบคงที่ที่แสดงผลเหมือนกันทุกที่

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่ปรับได้ อัปโหลด PDF แล้วฟอร์มและคำอธิบายประกอบทั้งหมดจะถูกฝังลงไป

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- นี่เป็นเครื่องมือแบบเร็ว (ซิงโครนัส) ที่คืนผลลัพธ์โดยตรง
- ค่าฟิลด์ฟอร์มจะถูกเก็บไว้เป็นข้อความคงที่ในผลลัพธ์
- คำอธิบายประกอบ (ความคิดเห็น การไฮไลต์ โน้ตแปะ) จะกลายเป็นส่วนหนึ่งของเนื้อหาหน้าและไม่สามารถแก้ไขได้อีกต่อไป
