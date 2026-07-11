---
description: "แปลงไฟล์ Markdown เป็น PDF ที่จัดสไตล์แล้ว"
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 5cf38edbc323
---

# Markdown to PDF {#markdown-to-pdf}

แปลงไฟล์ Markdown เป็นเอกสาร PDF ที่จัดสไตล์แล้ว ทรัพยากรจากระยะไกลถูกปิดใช้งานเพื่อความเป็นส่วนตัว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ Markdown

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ Markdown แล้วจะถูกแปลงเป็น PDF

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- รูปแบบไฟล์อินพุตที่รองรับ: `.md`, `.markdown`
- ทรัพยากรจากระยะไกล (รูปภาพ, สไตล์ชีตที่อ้างอิงผ่าน URL) จะไม่ถูกดึงมาเพื่อความเป็นส่วนตัวและความปลอดภัย
- Markdown จะถูกเรนเดอร์เป็น HTML ก่อน แล้วจึงแปลงเป็น PDF ผ่าน WeasyPrint
- บล็อกโค้ด, ตาราง และองค์ประกอบ Markdown อื่น ๆ จะถูกจัดสไตล์ในเอาต์พุต PDF
