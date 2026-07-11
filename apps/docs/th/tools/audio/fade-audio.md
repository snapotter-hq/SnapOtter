---
description: "เพิ่มเอฟเฟกต์ fade-in และ fade-out ให้กับเสียง"
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: ef12bd0fdf3e
---

# Fade Audio {#fade-audio}

เพิ่มเอฟเฟกต์ fade-in และ fade-out ที่จุดเริ่มต้นและจุดสิ้นสุดของไฟล์เสียง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| fadeInS | number | ไม่ | `1` | ระยะเวลา fade-in เป็นวินาที (0 ถึง 30) |
| fadeOutS | number | ไม่ | `1` | ระยะเวลา fade-out เป็นวินาที (0 ถึง 30) |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## หมายเหตุ {#notes}

- ตั้งค่าใดค่าหนึ่งเป็น `0` เพื่อข้ามทิศทางการเฟดนั้น อย่างน้อยหนึ่งค่าต้องมากกว่า 0
- ระยะเวลาการเฟดถูกจำกัดไว้ที่ความยาวของเสียงหากมันเกิน
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
