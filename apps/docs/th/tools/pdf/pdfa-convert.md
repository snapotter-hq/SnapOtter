---
description: "แปลง PDF เป็นรูปแบบเก็บถาวร PDF/A-2 เพื่อการเก็บรักษาระยะยาว"
i18n_source_hash: 9c568a340b6f
i18n_provenance: human
i18n_output_hash: 937598e2fa49
---

# ตัวแปลง PDF/A {#pdf-a-convert}

แปลง PDF เป็นรูปแบบเก็บถาวร PDF/A-2 ซึ่งเหมาะสำหรับการเก็บรักษาระยะยาวและการปฏิบัติตามข้อกำหนดด้านกฎระเบียบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF ไม่จำเป็นต้องมีฟิลด์ `settings`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์ PDF ได้โดยตรง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- ผลลัพธ์เป็นไปตามมาตรฐาน PDF/A-2
- PDF/A ฝังฟอนต์ทั้งหมดและไม่อนุญาตการอ้างอิงภายนอก ดังนั้นไฟล์ผลลัพธ์อาจมีขนาดใหญ่กว่าต้นฉบับ
- การเข้ารหัสและ JavaScript จะถูกลบออกระหว่างการแปลง เนื่องจากมาตรฐาน PDF/A ไม่อนุญาต
