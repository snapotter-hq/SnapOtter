---
description: "สร้างคลิปริงโทนจากไฟล์เสียงใด ๆ"
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: 10aa95815c0b
---

# Ringtone Maker {#ringtone-maker}

สร้างคลิปริงโทน (.m4r) จากไฟล์เสียงใด ๆ โดยเลือกเวลาเริ่มต้นและระยะเวลา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงและฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| startS | number | ไม่ | `0` | เวลาเริ่มต้นเป็นวินาที (ต่ำสุด 0) |
| durationS | number | ไม่ | `30` | ระยะเวลาคลิปเป็นวินาที (1 ถึง 30) |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## หมายเหตุ {#notes}

- เอาต์พุตเป็นรูปแบบ M4R เสมอ เข้ากันได้กับริงโทน iPhone
- ระยะเวลาริงโทนสูงสุดคือ 30 วินาที (ขีดจำกัดของ Apple)
- สามารถใช้รูปแบบเสียงใด ๆ เป็นอินพุตได้
