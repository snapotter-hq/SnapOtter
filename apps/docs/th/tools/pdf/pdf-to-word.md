---
description: "แปลง PDF เป็นเอกสาร Word (DOCX)"
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: 8decc178a180
---

# PDF to Word {#pdf-to-word}

แปลง PDF ที่เป็นข้อความให้เป็นเอกสาร Word (DOCX) เหมาะที่สุดสำหรับ PDF ที่มีข้อความที่เลือกได้ ส่วนหน้าที่สแกนมาจะต้องใช้ OCR ก่อน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่ปรับได้ อัปโหลด PDF แล้วจะถูกแปลงเป็น DOCX

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

คืนค่า `202 Accepted` ติดตามความคืบหน้าผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- ทำงานได้ดีที่สุดกับ PDF ที่เป็นข้อความ หน้าที่สแกนหรือเป็นรูปภาพล้วนจะให้ผลลัพธ์ว่างเปล่าหรือน้อยมาก ใช้ [PDF OCR](./ocr-pdf) เพื่อเพิ่มชั้นข้อความก่อน
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
- เค้าโครงที่ซับซ้อน (หลายคอลัมน์ องค์ประกอบซ้อนทับกัน) อาจแปลงได้ไม่สมบูรณ์แบบ
