---
description: "แปลงงานนำเสนอเป็น PDF"
i18n_source_hash: 49bd71c46bed
i18n_provenance: human
i18n_output_hash: e52f4e31f71d
---

# PowerPoint to PDF {#powerpoint-to-pdf}

แปลงงานนำเสนอ PowerPoint หรือ OpenDocument เป็น PDF โดยหนึ่งสไลด์ต่อหนึ่งหน้า

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/powerpoint-to-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PowerPoint/ODP

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดงานนำเสนอแล้วจะถูกแปลงเป็น PDF

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/powerpoint-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx"
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

- รูปแบบไฟล์อินพุตที่รองรับ: `.pptx`, `.ppt`, `.odp`
- แต่ละสไลด์จะกลายเป็นหนึ่งหน้าใน PDF
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
- แอนิเมชันและทรานสิชันจะไม่รวมอยู่ในเอาต์พุต PDF
