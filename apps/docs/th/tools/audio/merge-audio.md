---
description: "รวมไฟล์เสียงหลายไฟล์เข้าเป็นแทร็กเดียวแบบต่อเนื่อง"
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: 8fe69aa351be
---

# Merge Audio {#merge-audio}

รวมไฟล์เสียงสองไฟล์ขึ้นไปเข้าเป็นแทร็กเดียวแบบต่อเนื่อง เชื่อมต่อกันตามลำดับที่อัปโหลด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

รับข้อมูลฟอร์มแบบ multipart พร้อมไฟล์เสียงหลายไฟล์และฟิลด์ JSON `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| format | string | ไม่ | `"mp3"` | รูปแบบเอาต์พุต: `mp3`, `wav`, `flac`, `m4a` |

## ตัวอย่างคำขอ {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## หมายเหตุ {#notes}

- รับได้ 2 ถึง 10 ไฟล์เสียงต่อคำขอ
- ไฟล์ถูกเชื่อมต่อตามลำดับการอัปโหลด
- ไฟล์อินพุตทั้งหมดถูกเข้ารหัสใหม่เป็นรูปแบบเอาต์พุตและอัตราตัวอย่างที่เลือกเพื่อการเชื่อมต่อที่ราบรื่น
- รองรับรูปแบบอินพุตที่ผสมกัน (เช่น WAV หนึ่งไฟล์และ MP3 หนึ่งไฟล์)
