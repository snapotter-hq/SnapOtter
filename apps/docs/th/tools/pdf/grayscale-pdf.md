---
description: "แปลงสีทั้งหมดใน PDF ให้เป็นโทนสีเทา"
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: 065162d2ee42
---

# Grayscale PDF {#grayscale-pdf}

แปลงสีทั้งหมดใน PDF ให้เป็นโทนสีเทา สร้างเอกสารเวอร์ชันขาวดำ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF ไม่จำเป็นต้องมีฟิลด์ `settings`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์ PDF ได้โดยตรง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- พื้นที่สีทั้งหมด (RGB, CMYK) จะถูกแปลงเป็นโทนสีเทา รวมถึงรูปภาพที่ฝังอยู่ กราฟิกเวกเตอร์ และข้อความ
- ไฟล์ผลลัพธ์มักจะเล็กกว่าต้นฉบับ เนื่องจากข้อมูลโทนสีเทาต้องการจำนวนไบต์ต่อพิกเซลน้อยกว่า
