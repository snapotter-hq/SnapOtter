---
description: "ลบการป้องกันด้วยรหัสผ่านออกจาก PDF"
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 9956bfadb948
---

# Unlock PDF {#unlock-pdf}

ลบการป้องกันด้วยรหัสผ่านออกจาก PDF ที่เข้ารหัสโดยการระบุรหัสผ่านที่ถูกต้อง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | รหัสผ่านสำหรับถอดรหัส PDF (1-256 อักขระ) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- ต้องระบุรหัสผ่านที่ถูกต้อง รหัสผ่านที่ไม่ถูกต้องจะคืนข้อผิดพลาด 400
- ทั้งรหัสผ่านผู้ใช้หรือรหัสผ่านเจ้าของสามารถใช้ในการถอดรหัสได้
- รหัสผ่านจะถูกปิดบังจากบันทึกการตรวจสอบ
