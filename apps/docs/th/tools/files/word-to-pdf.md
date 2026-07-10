---
description: "แปลงเอกสาร Word เป็น PDF"
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 87be3f60af5d
---

# Word to PDF {#word-to-pdf}

แปลงเอกสาร Word, ข้อความ OpenDocument, RTF หรือไฟล์ข้อความล้วนเป็น PDF

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ Word/ODT/RTF/TXT

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดเอกสารแล้วจะถูกแปลงเป็น PDF

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Example Response {#example-response}

ส่งคืน `202 Accepted` ติดตามความคืบหน้าผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- รูปแบบไฟล์อินพุตที่รองรับ: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
- ฟอนต์ที่ฝังอยู่ในเอกสารจะถูกใช้เมื่อมี มิฉะนั้นจะใช้ฟอนต์ระบบแทน
- ส่วนหัว, ส่วนท้าย, ตาราง และรูปภาพจะถูกรักษาไว้ในเอาต์พุต PDF
