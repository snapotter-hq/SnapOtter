---
description: "รวมไฟล์ PDF หลายไฟล์เป็นเอกสารเดียว"
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: a6d1017d486e
---

# Merge PDFs {#merge-pdfs}

รวมไฟล์ PDF สองไฟล์ขึ้นไปเป็นเอกสารเดียว โดยคงลำดับหน้าของแต่ละไฟล์อินพุตไว้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF สองไฟล์ขึ้นไป ไม่จำเป็นต้องมีฟิลด์ `settings`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า เพียงแค่อัปโหลดไฟล์ PDF สองไฟล์ขึ้นไป

| Constraint | Value |
|------------|-------|
| จำนวนไฟล์ขั้นต่ำ | 2 |
| จำนวนไฟล์สูงสุด | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- ไฟล์จะถูกรวมตามลำดับที่อัปโหลด
- ต้องมีไฟล์ PDF อย่างน้อยสองไฟล์ คำขอจะล้มเหลวด้วยข้อผิดพลาด 400 หากมีน้อยกว่านั้น
- จำนวนไฟล์อินพุตสูงสุดคือ 20 ไฟล์
- PDF ที่เข้ารหัสต้องปลดล็อกก่อนรวม
