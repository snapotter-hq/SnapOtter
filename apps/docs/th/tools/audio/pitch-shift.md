---
description: "เพิ่มหรือลดระดับเสียงเป็นเซมิโทนโดยไม่เปลี่ยนความเร็ว"
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: feec52d679a5
---

# Pitch Shift {#pitch-shift}

เพิ่มหรือลดระดับเสียงของไฟล์เสียงเป็นจำนวนเซมิโทนโดยไม่เปลี่ยนความเร็วในการเล่น

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| semitones | integer | ไม่ | `3` | เซมิโทนที่จะเลื่อน (-12 ถึง 12) ต้องไม่เป็นศูนย์ |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- ค่าบวกจะเพิ่มระดับเสียง ค่าลบจะลดระดับเสียง
- การเลื่อน 12 เซมิโทนเท่ากับขึ้นหนึ่งอ็อกเทฟ -12 เท่ากับลงหนึ่งอ็อกเทฟ
- ระยะเวลาในการเล่นยังคงเท่าเดิมไม่ว่าจะเลื่อนเท่าใด
- เอาต์พุตมักคงคอนเทนเนอร์อินพุตไว้ อินพุต AAC จะเขียนเป็น M4A และอินพุตแบบถอดรหัสอย่างเดียวที่ไม่รองรับจะถอยกลับเป็น MP3
