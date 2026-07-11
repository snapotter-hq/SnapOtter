---
description: "กลับไฟล์เสียงให้เล่นย้อนหลัง"
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 5731614fa612
---

# Reverse Audio {#reverse-audio}

กลับไฟล์เสียงให้เล่นย้อนหลัง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ ไฟล์เสียงทั้งหมดจะถูกกลับด้าน

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- แทร็กเสียงทั้งหมดถูกกลับจากท้ายไปหน้า
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
