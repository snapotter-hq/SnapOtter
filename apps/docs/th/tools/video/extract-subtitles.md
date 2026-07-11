---
description: "ดึงแทร็กคำบรรยายออกจากวิดีโอเป็นไฟล์ SRT"
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: cc48f65d3c4f
---

# Extract Subtitles {#extract-subtitles}

ดึงแทร็กคำบรรยายที่ฝังอยู่ออกจากคอนเทนเนอร์วิดีโอและดาวน์โหลดเป็นไฟล์ SRT

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอ เครื่องมือนี้ไม่มีการตั้งค่าที่กำหนดค่าได้

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ โดยจะดึงแทร็กคำบรรยายแทร็กแรกที่พบในคอนเทนเนอร์วิดีโอ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- วิดีโอต้องมีแทร็กคำบรรยายที่ฝังอยู่ หากไม่พบแทร็กคำบรรยาย คำขอจะคืนค่าข้อผิดพลาด 400
- หากวิดีโอมีแทร็กคำบรรยายหลายแทร็ก จะดึงแทร็กแรกออกมา
- รูปแบบเอาต์พุตเป็น SRT ไม่ว่ารูปแบบคำบรรยายเดิมในคอนเทนเนอร์จะเป็นอะไร
