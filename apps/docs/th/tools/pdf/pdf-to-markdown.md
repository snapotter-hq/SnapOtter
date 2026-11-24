---
description: "แปลง PDF เป็น Markdown โดยคงหัวข้อ รายการ และตารางไว้เมื่อ PDF มีสิ่งเหล่านี้"
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 18bb6c223262
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

เปลี่ยน PDF เป็นไฟล์ Markdown ที่นำไปใส่ในวิกิ ไซต์สแตติก หรือไปป์ไลน์ LLM ได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่ปรับได้ อัปโหลด PDF แล้วจะได้ไฟล์ `.md` กลับมา

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

PDF ขนาดใหญ่อาจใช้เวลานานกว่าช่วงรอแบบซิงค์ เมื่อเป็นเช่นนั้น API จะตอบกลับด้วย `202` พร้อม `jobId` และคุณติดตามความคืบหน้าได้ที่ `/api/v1/jobs/{jobId}/progress`

## สิ่งที่ถูกคงไว้ {#what-gets-kept}

PDF เก็บข้อความที่วางตำแหน่งไว้แล้ว ไม่ได้เก็บโครงสร้าง ตัวแปลงจึงต้องอนุมานโครงสร้างเอง

- **หัวข้อ** บรรทัดสั้นที่ตั้งขนาดใหญ่กว่าเนื้อหาอย่างชัดเจนจะกลายเป็นหัวข้อตั้งแต่ `#` ถึง `######` โดยจัดอันดับตามขนาดทั่วทั้งเอกสาร
- **รายการ** บรรทัดที่ขึ้นต้นด้วยสัญลักษณ์หัวข้อย่อยหรือตัวเลขจะกลายเป็นรายการ
- **ตัวหนา ตัวเอียง และลิงก์** คงไว้ในบรรทัด เฉพาะลิงก์ `http`, `https` และ `mailto` เท่านั้นที่เหลืออยู่
- **ตาราง** ตารางที่วาดด้วยเส้นกรอบจะออกมาเป็นตาราง Markdown ส่วนตารางที่จัดด้วยการเว้นวรรคอย่างเดียวมักออกมาเป็นย่อหน้าธรรมดา

รูปภาพจะถูกตัดทิ้ง เลย์เอาต์หลายคอลัมน์และการออกแบบหน้าที่ไม่ปกติทำได้เต็มที่เท่านั้น จึงควรตรวจผลลัพธ์ก่อนนำไปใช้งานจริง

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- ฟิลด์ `chars` ในการตอบกลับคือความยาวของผลลัพธ์ Markdown
- PDF ที่สแกนมาไม่มีชั้นข้อความให้แปลง เครื่องมือจะปฏิเสธด้วย `422` และโค้ด `NO_TEXT_LAYER` แทนการคืนไฟล์ว่าง ให้ใช้เครื่องมือ [PDF OCR](./ocr-pdf) กับไฟล์เหล่านี้
- หากต้องการแปลงกลับ [Markdown เป็น PDF](../files/markdown-to-pdf), [Markdown เป็น DOCX](../files/markdown-to-docx) และ [Markdown เป็น HTML](../files/markdown-to-html) อ่านไฟล์ `.md`
