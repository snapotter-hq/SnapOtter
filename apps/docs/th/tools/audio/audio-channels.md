---
description: "แปลงระหว่างโมโนกับสเตอริโอ หรือสลับช่องสัญญาณซ้ายและขวา"
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: ed8deb0adf27
---

# Audio Channels {#audio-channels}

แปลงเสียงระหว่างเลย์เอาต์โมโนกับสเตอริโอ หรือสลับช่องสัญญาณซ้ายและขวาของไฟล์สเตอริโอ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| mode | string | ใช่ | - | การดำเนินการช่องสัญญาณ: `stereo-to-mono`, `mono-to-stereo`, `swap` |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## หมายเหตุ {#notes}

- `stereo-to-mono` ผสมทั้งสองช่องสัญญาณเข้าเป็นแทร็กโมโนเดียว
- `mono-to-stereo` ทำสำเนาช่องสัญญาณโมโนไปยังทั้งซ้ายและขวา
- `swap` สลับช่องสัญญาณซ้ายและขวาของไฟล์สเตอริโอ
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
