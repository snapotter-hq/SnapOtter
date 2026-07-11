---
description: "แปลงไฟล์ HTML เป็น PDF"
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: ec3e034ada3b
---

# HTML to PDF {#html-to-pdf}

แปลงไฟล์ HTML เป็นเอกสาร PDF ที่มีการจัดรูปแบบ ทรัพยากรระยะไกล (ภาพภายนอก สไตล์ชีต สคริปต์) จะถูกปิดใช้งานเพื่อความเป็นส่วนตัว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

รับข้อมูล multipart form ที่มีไฟล์ HTML

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ HTML แล้วจะถูกแปลงเป็น PDF

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- รูปแบบอินพุตที่รับได้: `.html`, `.htm`
- ทรัพยากรระยะไกล (ภาพ สไตล์ชีต สคริปต์ที่อ้างอิงผ่าน URL) จะไม่ถูกดึงมาเพื่อความเป็นส่วนตัวและความปลอดภัย
- สไตล์อินไลน์และภาพที่ฝัง (data URI) จะถูกคงไว้
- การแปลงจัดการโดย WeasyPrint บนเซิร์ฟเวอร์
