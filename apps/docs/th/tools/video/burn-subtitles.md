---
description: "เรนเดอร์คำบรรยายลงบนเฟรมของวิดีโออย่างถาวร"
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: a2f5b4e33234
---

# Burn Subtitles {#burn-subtitles}

เรนเดอร์ (ฝังถาวร) คำบรรยายจากไฟล์ SRT, VTT หรือ ASS ลงบนทุกเฟรมของวิดีโอ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและไฟล์คำบรรยาย นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | ขนาดฟอนต์ของคำบรรยายเป็นพิกเซล (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- อัปโหลดสองไฟล์: ไฟล์แรกต้องเป็นวิดีโอ ไฟล์ที่สองต้องเป็นไฟล์คำบรรยาย (.srt, .vtt หรือ .ass)
- คำบรรยายที่ฝังลงไปจะเป็นส่วนหนึ่งของวิดีโออย่างถาวรและผู้ชมไม่สามารถปิดได้ หากต้องการคำบรรยายที่เปิด/ปิดได้ ให้ใช้เครื่องมือ Embed Subtitles แทน
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
