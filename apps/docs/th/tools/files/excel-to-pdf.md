---
description: "แปลงสเปรดชีตเป็น PDF"
i18n_source_hash: 4dbe2a810ea6
i18n_provenance: human
i18n_output_hash: 2836776e50cf
---

# Excel to PDF {#excel-to-pdf}

แปลงสเปรดชีต Excel, OpenDocument หรือ CSV เป็น PDF ชีตที่กว้างอาจแบ่งหน้าข้ามหลายหน้า

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/excel-to-pdf`

รับข้อมูล multipart form ที่มีไฟล์ Excel/ODS/CSV

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดสเปรดชีตแล้วจะถูกแปลงเป็น PDF

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/excel-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@budget.xlsx"
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

- รูปแบบอินพุตที่รับได้: `.xlsx`, `.xls`, `.ods`, `.csv`
- ชีตที่กว้างอาจถูกแบ่งข้ามหลายหน้าใน PDF ผลลัพธ์
- แผนภูมิและการจัดรูปแบบตามเงื่อนไขจะถูกเรนเดอร์ในผลลัพธ์ PDF
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
