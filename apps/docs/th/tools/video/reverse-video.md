---
description: "เล่นคลิปวิดีโอย้อนกลับ"
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: f6586eb6107b
---

# Reverse Video {#reverse-video}

เล่นคลิปวิดีโอย้อนกลับ แทร็กเสียงก็จะถูกย้อนกลับด้วย

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอ เครื่องมือนี้ไม่มีการตั้งค่าที่กำหนดค่าได้

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ โดยจะย้อนกลับทั้งวิดีโอ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- จำกัดที่คลิปยาวไม่เกิน 5 นาที วิดีโอที่ยาวกว่านั้นจะถูกปฏิเสธด้วยข้อผิดพลาด 400
- ทั้งแทร็กวิดีโอและเสียงจะถูกย้อนกลับ หากต้องการย้อนวิดีโอโดยไม่มีเสียง ให้ปิดเสียงก่อน
