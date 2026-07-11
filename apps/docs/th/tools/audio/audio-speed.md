---
description: "เร่งหรือลดความเร็วในการเล่นเสียงด้วยตัวคูณ"
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: 355e04fae319
---

# Audio Speed {#audio-speed}

เร่งหรือลดความเร็วในการเล่นเสียงโดยใช้ตัวคูณความเร็ว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| factor | number | ไม่ | `1.5` | ตัวคูณความเร็ว (0.25 ถึง 4) ค่าต่ำกว่า 1 ทำให้ช้าลง สูงกว่า 1 ทำให้เร็วขึ้น |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## หมายเหตุ {#notes}

- factor เท่ากับ `0.25` จะเล่นที่ความเร็วหนึ่งในสี่ (ยาวขึ้น 4 เท่า) factor เท่ากับ `4` จะเล่นที่ความเร็วสี่เท่า (สั้นลง 4 เท่า)
- ระดับเสียงถูกรักษาไว้ในขณะที่ความเร็วเปลี่ยน (time-stretch) ใช้ pitch-shift เพื่อปรับระดับเสียงอย่างเป็นอิสระ
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
