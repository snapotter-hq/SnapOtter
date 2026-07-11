---
description: "รวมคลิปวิดีโอหลายคลิปเป็นไฟล์เดียว"
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 7ad888455b63
---

# Merge Videos {#merge-videos}

รวมคลิปวิดีโอหลายคลิปเป็นไฟล์ MP4 เดียว อินพุตทั้งหมดจะถูกปรับให้เป็นความละเอียดของวิดีโอแรกและ 30 fps

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอตั้งแต่สองไฟล์ขึ้นไป นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์การตั้งค่า อัปโหลดไฟล์วิดีโอ 2-10 ไฟล์เป็นหลายส่วน `file`

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- คลิปจะถูกต่อเข้าด้วยกันตามลำดับที่อัปโหลด
- คลิปทั้งหมดจะถูกเข้ารหัสใหม่ให้ตรงกับความละเอียด อัตราเฟรม (30 fps) และโคเดก (H.264) ของคลิปแรก อินพุตที่ไม่ตรงกันจะถูกปรับให้เป็นมาตรฐานโดยอัตโนมัติ
- รับไฟล์วิดีโอ 2-10 ไฟล์ต่อคำขอ
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
