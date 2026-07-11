---
description: "ปรับ PDF ให้เป็นเชิงเส้นเพื่อการดูบนเว็บอย่างรวดเร็ว (การดาวน์โหลดแบบต่อเนื่อง)"
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 5341fd46ef0b
---

# Web-Optimize PDF {#web-optimize-pdf}

ปรับ PDF ให้เป็นเชิงเส้นเพื่อให้สามารถดาวน์โหลดและแสดงผลแบบต่อเนื่องในเว็บเบราว์เซอร์ได้โดยไม่ต้องรอไฟล์ทั้งหมด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF ไม่จำเป็นต้องมีฟิลด์ `settings`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์ PDF ได้โดยตรง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- การปรับเป็นเชิงเส้นจะจัดเรียงโครงสร้างภายในของ PDF ใหม่ เพื่อให้หน้าแรกแสดงผลได้ก่อนที่ไฟล์ทั้งหมดจะดาวน์โหลดเสร็จ
- ไฟล์ผลลัพธ์อาจมีขนาดใหญ่กว่าอินพุตเล็กน้อย เนื่องจากมีข้อมูลการปรับเป็นเชิงเส้นเพิ่มเข้ามา
- PDF ที่ปรับเป็นเชิงเส้นแล้วสามารถปรับซ้ำได้โดยไม่มีปัญหา
