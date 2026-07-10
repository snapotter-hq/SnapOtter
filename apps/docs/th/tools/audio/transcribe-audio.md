---
description: "แปลงคำพูดเป็นข้อความด้วยการถอดเสียงที่ขับเคลื่อนด้วย AI"
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 8dba3f88764a
---

# Transcribe Audio {#transcribe-audio}

แปลงคำพูดเป็นข้อความโดยใช้การถอดเสียงที่ขับเคลื่อนด้วย AI (faster-whisper) รองรับรูปแบบผลลัพธ์เป็นข้อความธรรมดา SRT และ VTT พร้อมการเลือกภาษาแบบอัตโนมัติหรือด้วยตนเอง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | ภาษา: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | รูปแบบผลลัพธ์: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

นี่คือเครื่องมือแบบ async API จะส่งคืน `202 Accepted` ทันที:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

ติดตามความคืบหน้าผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` เมื่องานเสร็จสมบูรณ์ สตรีม SSE จะส่งมอบผลลัพธ์สุดท้ายพร้อม `downloadUrl`

## Notes {#notes}

- ต้องติดตั้งชุดฟีเจอร์ **transcription** จะส่งคืน `501` พร้อมโค้ด `FEATURE_NOT_INSTALLED` ตัว `feature`, `featureName` และ `estimatedSize` ที่ขาดหายไป หากไม่มีชุดฟีเจอร์ดังกล่าว
- ใช้ faster-whisper สำหรับการถอดเสียง ภาษา `auto` จะตรวจจับภาษาที่พูดโดยอัตโนมัติ
- รูปแบบ `srt` และ `vtt` มีการประทับเวลาสำหรับแต่ละเซกเมนต์ เหมาะสำหรับคำบรรยาย
- รูปแบบ `txt` ส่งคืนข้อความธรรมดาโดยไม่มีการประทับเวลา
- นี่คือเครื่องมือ AI ที่ใช้เวลานาน เวลาในการประมวลผลขึ้นอยู่กับความยาวของเสียงและฮาร์ดแวร์ของเซิร์ฟเวอร์
