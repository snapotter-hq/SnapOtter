---
description: "ดึงข้อความธรรมดาจาก PDF"
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 464472629bcf
---

# PDF to Text {#pdf-to-text}

ดึงข้อความธรรมดาที่อ่านได้ทั้งหมดจากเอกสาร PDF ไปยังไฟล์ข้อความ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่ปรับได้ อัปโหลด PDF แล้วเนื้อหาข้อความจะถูกดึงออกมา

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- นี่เป็นเครื่องมือแบบเร็ว (ซิงโครนัส) ที่คืนผลลัพธ์โดยตรง
- ฟิลด์ `chars` ในการตอบกลับจะระบุจำนวนอักขระที่ดึงออกมา
- ดึงเฉพาะข้อความที่ฝังอยู่ในรูปแบบดิจิทัลเท่านั้น สำหรับเอกสารที่สแกนหรือ PDF ที่เป็นรูปภาพ ให้ใช้เครื่องมือ [PDF OCR](./ocr-pdf) แทน
