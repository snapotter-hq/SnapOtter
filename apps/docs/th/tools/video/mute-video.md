---
description: "ลบแทร็กเสียงออกจากวิดีโอ"
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 26ff9775dcf7
---

# Mute Video {#mute-video}

ลบแทร็กเสียงออกจากวิดีโอ เหลือไว้เพียงสตรีมภาพ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอ เครื่องมือนี้ไม่มีการตั้งค่าที่กำหนดค่าได้

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ โดยจะตัดแทร็กเสียงออกจากวิดีโอที่อัปโหลด

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- สตรีมวิดีโอจะถูกคัดลอกโดยไม่เข้ารหัสใหม่ จึงไม่มีการสูญเสียคุณภาพ
- หากวิดีโออินพุตไม่มีแทร็กเสียง ไฟล์จะถูกคืนค่ากลับมาโดยไม่เปลี่ยนแปลง
