---
description: "แปลงเสียงระหว่างรูปแบบ MP3, WAV, OGG, FLAC และ M4A"
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: 1b7f2a6ace20
---

# Convert Audio {#convert-audio}

แปลงไฟล์เสียงระหว่างรูปแบบทั่วไปรวมถึง MP3, WAV, OGG, FLAC และ M4A พร้อมบิตเรตเอาต์พุตที่กำหนดค่าได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| format | string | ไม่ | `"mp3"` | รูปแบบเอาต์พุต: `mp3`, `wav`, `ogg`, `flac`, `m4a` |
| bitrateKbps | integer | ไม่ | `192` | บิตเรตเอาต์พุตเป็น kbps (32 ถึง 320) |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## หมายเหตุ {#notes}

- รูปแบบอินพุตที่รองรับรวมถึง MP3, WAV, OGG, FLAC, AAC, M4A, WMA, AIFF และ OPUS
- บิตเรตใช้ได้กับรูปแบบแบบสูญเสีย (MP3, OGG, M4A) เท่านั้น รูปแบบแบบไม่สูญเสียเช่น WAV และ FLAC จะเพิกเฉยการตั้งค่านี้
- ชื่อไฟล์เอาต์พุตคงชื่อเดิมไว้พร้อมนามสกุลใหม่
