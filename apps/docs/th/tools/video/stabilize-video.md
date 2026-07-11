---
description: "ลดการสั่นของกล้องด้วยการปรับเสถียรภาพแบบสองรอบ"
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: cf41d5eb1bda
---

# Stabilize Video {#stabilize-video}

ลดการสั่นของกล้องในภาพที่ถ่ายด้วยมือโดยใช้การปรับเสถียรภาพแบบสองรอบ vidstab ของ FFmpeg

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings` นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | ขนาดหน้าต่างการปรับให้เรียบเป็นเฟรม (5-60) ค่าที่สูงขึ้นจะให้การเคลื่อนไหวที่เรียบเนียนกว่า |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- การปรับเสถียรภาพเป็นกระบวนการสองรอบ: รอบแรกวิเคราะห์การเคลื่อนไหวของกล้อง และรอบที่สองใช้การแก้ไข กระบวนการนี้ใช้เวลาราวสองเท่าของเครื่องมือแบบรอบเดียว
- ค่าการปรับให้เรียบที่สูงขึ้นจะลดการสั่นได้มากกว่าแต่อาจทำให้เกิดการครอบตัดซูมเล็กน้อยที่ขอบ
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
