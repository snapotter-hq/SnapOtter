---
description: "แปลงเสียงระหว่างรูปแบบ MP3, WAV, OGG, FLAC และ M4A"
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: 1b7f2a6ace20
---

# Convert Audio {#convert-audio}

แปลงไฟล์เสียงระหว่างรูปแบบทั่วไปรวมถึง MP3, WAV, OGG, FLAC และ M4A พร้อมบิตเรตเอาต์พุตและอัตราสุ่มตัวอย่างที่กำหนดค่าได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| format | string | ไม่ | `"mp3"` | รูปแบบเอาต์พุต: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | ไม่ | `192` | บิตเรตเอาต์พุตเป็น kbps (32 ถึง 320) |
| sampleRate | integer | ไม่ | อัตราเดิม | อัตราสุ่มตัวอย่างเอาต์พุตเป็น Hz: `8000`, `16000`, `22050`, `32000`, `44100`, `48000` หรือ `96000` ละไว้เพื่อคงอัตราเดิม |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## หมายเหตุ {#notes}

- รูปแบบอินพุตที่รองรับรวมถึง MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF และ OPUS
- บิตเรตใช้ได้กับรูปแบบแบบสูญเสีย (MP3, OGG, M4A) เท่านั้น รูปแบบแบบไม่สูญเสียเช่น WAV และ FLAC จะเพิกเฉยการตั้งค่านี้
- เอาต์พุต MP3 รองรับอัตราสุ่มตัวอย่างสูงสุด 48000 Hz ตัวเลือก 96000 Hz ใช้ได้กับ WAV, OGG, FLAC และ M4A เท่านั้น
- บิตเรต MP3 ถูกจำกัดตามอัตราสุ่มตัวอย่าง: สูงสุด 64 kbps ที่ 8000 Hz และ 160 kbps ที่ 16000 หรือ 22050 Hz คำขอที่เกินขีดจำกัดจะถูกปฏิเสธแทนที่จะถูกปรับลดลงโดยไม่แจ้ง
- ชื่อไฟล์เอาต์พุตคงชื่อเดิมไว้พร้อมนามสกุลใหม่
