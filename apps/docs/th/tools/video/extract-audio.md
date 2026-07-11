---
description: "ดึงแทร็กเสียงออกจากวิดีโอ"
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: a531d61f0f39
---

# Extract Audio {#extract-audio}

ดึงแทร็กเสียงออกจากไฟล์วิดีโอและบันทึกเป็น MP3, WAV, M4A หรือ OGG

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | รูปแบบเสียงเอาต์พุต: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- หากวิดีโอไม่มีแทร็กเสียง คำขอจะคืนค่าข้อผิดพลาด 400
- MP3 เป็นแบบ lossy แต่รองรับได้อย่างกว้างขวาง WAV เป็นแบบ lossless แต่ไฟล์ใหญ่ M4A (AAC) ให้สมดุลที่ดีระหว่างคุณภาพและขนาด OGG มีให้ใช้สำหรับเวิร์กโฟลว์โคเดกแบบเปิด
- เมื่อเสียงต้นฉบับเป็น AAC อยู่แล้วและรูปแบบเอาต์พุตเป็น M4A สตรีมเสียงจะถูกคัดลอกโดยไม่เข้ารหัสใหม่
