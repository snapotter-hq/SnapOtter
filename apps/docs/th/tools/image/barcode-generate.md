---
description: "สร้างบาร์โค้ดในรูปแบบ Code 128, EAN-13, UPC-A, Code 39, ITF-14 และ Data Matrix"
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 8a8da6b3a98f
---

# Barcode Generator {#barcode-generator}

สร้างรูปภาพบาร์โค้ดจากข้อความอินพุต รองรับรูปแบบ Code 128, EAN-13, UPC-A, Code 39, ITF-14 และ Data Matrix

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

รับเนื้อหา `application/json` (ไม่ใช่ multipart) บาร์โค้ดถูกสร้างจากข้อความที่ให้มา ไม่ใช่จากไฟล์ที่อัปโหลด

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ข้อความที่จะเข้ารหัสในบาร์โค้ด (1-256 ตัวอักษร) |
| type | string | No | `"code128"` | รูปแบบบาร์โค้ด: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | No | `3` | ปัจจัยการปรับขนาดรูปภาพ (1-8) |
| includeText | boolean | No | `true` | จะเรนเดอร์ข้อความใต้บาร์โค้ดหรือไม่ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- ต่างจากเครื่องมือส่วนใหญ่ เอนด์พอยต์นี้รับเนื้อหา JSON ไม่ใช่ multipart form data เนื่องจากบาร์โค้ดถูกสร้างจากข้อความมากกว่าไฟล์ที่อัปโหลด
- EAN-13 ต้องมี 12 หรือ 13 หลักพอดี UPC-A ต้องมี 11 หรือ 12 หลักพอดี หากละเว้นหลักตรวจสอบ ระบบจะคำนวณให้อัตโนมัติ
- Code 128 เป็นรูปแบบที่ยืดหยุ่นที่สุดและรองรับชุดอักขระ ASCII ทั้งหมด
- Data Matrix สร้างบาร์โค้ด 2 มิติที่เหมาะสำหรับเข้ารหัสสตริงที่ยาวขึ้นในรูปสี่เหลี่ยมจัตุรัสที่กะทัดรัด
