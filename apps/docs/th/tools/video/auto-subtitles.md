---
description: "สร้างไฟล์คำบรรยายจากแทร็กเสียงของวิดีโอโดยใช้ AI"
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 97d932c276f1
---

# Auto Subtitles {#auto-subtitles}

สร้างไฟล์คำบรรยายจากแทร็กเสียงของวิดีโอโดยใช้การรู้จำเสียงพูดที่ขับเคลื่อนด้วย AI (faster-whisper) รองรับการตรวจจับอัตโนมัติและ 10 ภาษาที่ระบุชัดเจน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

รับข้อมูลแบบ multipart form data พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings` นี่เป็นเอนด์พอยต์แบบอะซิงโครนัส คืนค่า `202 Accepted` ทันทีและสตรีมความคืบหน้าผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | ภาษาของเสียงพูด: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | รูปแบบคำบรรยายผลลัพธ์: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- นี่เป็นเครื่องมือ AI ที่ต้องติดตั้งชุดฟีเจอร์ **transcription** หากยังไม่ได้ติดตั้งชุดฟีเจอร์ API จะคืนค่า `501 Feature Not Installed` พร้อมคำแนะนำในการติดตั้งผ่าน admin UI
- ตัวเลือกภาษา `auto` ใช้การตรวจจับภาษาในตัวของ whisper การระบุภาษาชัดเจนจะช่วยเพิ่มความแม่นยำและความเร็ว
- SRT เป็นรูปแบบคำบรรยายที่ได้รับการรองรับกว้างขวางที่สุด ส่วน VTT (WebVTT) เป็นมาตรฐานสำหรับโปรแกรมเล่นวิดีโอบนเว็บ
- การอัปเดตความคืบหน้ามีให้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
