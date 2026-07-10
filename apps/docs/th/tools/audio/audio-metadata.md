---
description: "ดู แก้ไข หรือลบแท็กเมทาดาทาของเสียง (ID3)"
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: cf6ca09da961
---

# Audio Metadata {#audio-metadata}

ดู แก้ไข หรือลบแท็กเมทาดาทาของเสียง เช่น title, artist และ album (ID3 และรูปแบบแท็กที่คล้ายกัน)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| strip | boolean | ไม่ | `false` | ลบแท็กเมทาดาทาที่มีอยู่ทั้งหมด |
| title | string | ไม่ | - | ตั้งค่าแท็ก title (สูงสุด 500 อักขระ) |
| artist | string | ไม่ | - | ตั้งค่าแท็ก artist (สูงสุด 500 อักขระ) |
| album | string | ไม่ | - | ตั้งค่าแท็ก album (สูงสุด 500 อักขระ) |

## ตัวอย่างคำขอ {#example-request}

แก้ไขแท็กเมทาดาทา:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

ลบเมทาดาทาทั้งหมด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## หมายเหตุ {#notes}

- การตอบกลับมีออบเจ็กต์ `metadata` พร้อมรูปแบบคอนเทนเนอร์ ระยะเวลา บิตเรต และแท็กปัจจุบัน
- เมื่อ `strip` เป็น `true` ฟิลด์แท็กทั้งหมดจะถูกเพิกเฉยและแท็กที่มีอยู่ทุกตัวจะถูกลบ
- อัปเดตเฉพาะแท็กที่คุณระบุเท่านั้น แท็กที่ไม่ได้ระบุจะยังคงไม่เปลี่ยนแปลง
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต
