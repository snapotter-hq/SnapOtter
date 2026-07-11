---
description: "ปรับความดังให้เท่ากันตามมาตรฐานการออกอากาศ (EBU R128)"
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: f757611df8cb
---

# Normalize Audio {#normalize-audio}

ปรับความดังของเสียงให้เท่ากันตามระดับมาตรฐานการออกอากาศโดยใช้การนอร์มัลไลซ์ EBU R128 (-16 LUFS)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ มันใช้การนอร์มัลไลซ์ความดัง EBU R128 โดยอัตโนมัติ

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- ใช้มาตรฐานความดัง EBU R128 โดยตั้งเป้าที่ -16 LUFS
- เหมาะสำหรับพอดแคสต์ หนังสือเสียง และเนื้อหาออกอากาศที่ความดังคงที่เป็นสิ่งสำคัญ
- อัตราตัวอย่างต้นทางถูกรักษาไว้ในเอาต์พุต
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
