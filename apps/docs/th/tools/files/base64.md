---
description: "เข้ารหัสข้อความเป็น Base64 หรือถอดรหัส Base64 กลับเป็นข้อความ"
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 81b42aea496c
i18n_hash_version: 2
---

# Base64 Encode / Decode {#base64}

วางข้อความเพื่อรับ Base64 หรือวาง Base64 เพื่อรับข้อความกลับมา แล้วคัดลอกผลลัพธ์ ข้อความจะถูกส่งไปยังเซิร์ฟเวอร์ SnapOtter ของคุณเองเท่านั้น ไม่ส่งไปที่อื่น

หากต้องการแปลงรูปภาพเป็น Base64 ให้ใช้ [Image to Base64](/th/tools/image/image-to-base64) แทน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

รับเนื้อหา JSON ไม่ใช่ multipart form data และตอบกลับด้วยข้อความที่แปลงแล้วแทนไฟล์ให้ดาวน์โหลด

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (จำเป็น) | ข้อความที่จะเข้ารหัส หรือ Base64 ที่จะถอดรหัส สูงสุด 1,000,000 ตัวอักษร |
| `mode` | string | (จำเป็น) | `encode` หรือ `decode` |
| `urlSafe` | boolean | `false` | เมื่อเข้ารหัส ให้ใช้ชุดอักขระที่ปลอดภัยสำหรับ URL (`-` และ `_`) และตัดการเติม `=` ออก ไม่มีผลเมื่อถอดรหัส |

## Example Request {#example-request}

เข้ารหัส:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

ถอดรหัส:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- ข้อความถูกเข้ารหัสเป็น UTF-8 ดังนั้นตัวอักษรที่มีเครื่องหมายกำกับ CJK และอีโมจิจะกลับมาครบถ้วน
- การถอดรหัสจะไม่สนใจช่องว่างและการขึ้นบรรทัดใหม่ ดังนั้น Base64 ที่ตัดบรรทัดที่ 76 คอลัมน์ (อีเมล เนื้อหา PEM) จึงถอดรหัสได้ตามที่วาง
- การถอดรหัสรับอินพุตที่มีหรือไม่มีการเติม `=` ก็ได้ ทั้งชุดอักขระมาตรฐาน (`+`, `/`) หรือชุดที่ปลอดภัยสำหรับ URL (`-`, `_`) แต่ใช้ปนกันไม่ได้
- อินพุตที่ไม่ใช่ Base64 จะล้มเหลวด้วย 400 และรหัส `ENCODED_TEXT_INVALID` ส่วน Base64 ที่ถูกต้องแต่ถอดรหัสแล้วได้ข้อมูลไบนารี (รูปภาพ ZIP) ไม่ใช่ข้อความ UTF-8 จะล้มเหลวด้วย `DECODED_DATA_NOT_TEXT`
