---
description: "เพิ่มการป้องกันด้วยรหัสผ่านพร้อมการเข้ารหัส AES-256 ให้กับ PDF"
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 61cf1be4ea2b
---

# Protect PDF {#protect-pdf}

เพิ่มการป้องกันด้วยรหัสผ่านให้กับ PDF โดยใช้การเข้ารหัส AES-256

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| userPassword | string | Yes | - | รหัสผ่านที่ต้องใช้ในการเปิด PDF (1-256 อักขระ) |
| ownerPassword | string | No | เหมือนกับ `userPassword` | รหัสผ่านเจ้าของสำหรับสิทธิ์ (1-256 อักขระ) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- การเข้ารหัสใช้ AES-256
- หากละเว้น `ownerPassword` ค่าเริ่มต้นจะเป็นค่าเดียวกับ `userPassword`
- รหัสผ่านจะถูกปิดบังจากบันทึกการตรวจสอบ
- PDF ที่เข้ารหัสต้องใช้รหัสผ่านผู้ใช้ในการเปิด และรหัสผ่านเจ้าของ (หากต่างกัน) สำหรับสิทธิ์เต็ม
