---
description: "แปลงไฟล์ Word, Markdown, HTML หรือข้อความล้วนเป็น EPUB"
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 0d10017ccf23
---

# Convert to EPUB {#convert-to-epub}

แปลงเอกสาร Word, Markdown, HTML หรือไฟล์ข้อความล้วนเป็นรูปแบบหนังสืออิเล็กทรอนิกส์ EPUB

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ Word/Markdown/HTML/TXT

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดเอกสารแล้วจะถูกแปลงเป็น EPUB

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- รูปแบบไฟล์อินพุตที่รองรับ: `.docx`, `.md`, `.html`, `.txt`
- เอาต์พุต EPUB เป็นไปตามข้อกำหนด EPUB 3
- หัวข้อในเอกสารต้นฉบับจะถูกใช้สร้างสารบัญ
- การแปลงจัดการโดย Pandoc บนเซิร์ฟเวอร์
