---
description: "แปลงไฟล์ Markdown เป็นเอกสาร Word (DOCX)"
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 5284cb3c2ada
---

# Markdown to Word {#markdown-to-word}

แปลงไฟล์ Markdown เป็นเอกสาร Word (DOCX) โดยคงหัวเรื่อง รายการ บล็อกโค้ด และการจัดรูปแบบอื่น ๆ ไว้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

รับข้อมูล multipart form ที่มีไฟล์ Markdown

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ Markdown แล้วจะถูกแปลงเป็น DOCX

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รับได้: `.md`, `.markdown`
- นี่คือเครื่องมือแบบเร็ว (ซิงโครนัส) ที่ส่งคืนผลลัพธ์โดยตรง
- หัวเรื่อง ตัวหนา ตัวเอียง ลิงก์ บล็อกโค้ด และรายการ จะถูกแมปไปยังสไตล์ของ Word
- การแปลงจัดการโดย Pandoc บนเซิร์ฟเวอร์
