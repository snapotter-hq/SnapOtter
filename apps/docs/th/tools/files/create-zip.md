---
description: "รวมไฟล์หลายไฟล์เป็นไฟล์เก็บถาวร ZIP เดียว"
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: ae319d52ad9f
---

# Create ZIP {#create-zip}

รวมไฟล์หลายไฟล์ทุกประเภทเป็นไฟล์เก็บถาวร ZIP เดียว ชื่อไฟล์ที่ซ้ำกันจะถูกกำจัดความซ้ำโดยอัตโนมัติ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

รับข้อมูล multipart form ที่มีไฟล์ตั้งแต่สองไฟล์ขึ้นไป ไม่จำเป็นต้องมีฟิลด์การตั้งค่า

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ 2-50 ไฟล์ทุกประเภทเพื่อรวมเข้าด้วยกัน

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- ต้องการไฟล์อินพุตระหว่าง 2 ถึง 50 ไฟล์
- รับไฟล์ทุกประเภท ไม่มีข้อจำกัดในรูปแบบอินพุต
- หากไฟล์หลายไฟล์ใช้ชื่อเดียวกัน ระบบจะกำจัดความซ้ำโดยอัตโนมัติด้วยส่วนต่อท้ายที่เป็นตัวเลข
- ไฟล์เก็บถาวรผลลัพธ์ใช้การบีบอัด ZIP มาตรฐาน (deflate)
