---
description: "เปลี่ยนคลิปวิดีโอเป็น GIF แบบเคลื่อนไหว"
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: 6af900c3e580
---

# Video to GIF {#video-to-gif}

เปลี่ยนคลิปวิดีโอเป็น GIF แบบเคลื่อนไหว พร้อมกำหนดค่าอัตราเฟรม ความกว้าง เวลาเริ่มต้น และระยะเวลาได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings` นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | อัตราเฟรมเอาต์พุต (1-30) |
| width | integer | No | `480` | ความกว้างเอาต์พุตเป็นพิกเซล (64-1280) ความสูงจะปรับสเกลตามสัดส่วน |
| startS | number | No | `0` | เวลาเริ่มต้นเป็นวินาที (ต้อง >= 0) |
| durationS | number | No | `5` | ระยะเวลาเป็นวินาที (มากกว่า 0 สูงสุด 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- ค่า `fps` และ `width` ที่ต่ำลงจะสร้างไฟล์ GIF ที่เล็กกว่า GIF กว้าง 480px ที่ 12 fps มักเป็นสมดุลที่ดี
- ระยะเวลาสูงสุดคือ 60 วินาที คลิปที่ยาวกว่าจะสร้างไฟล์ที่ใหญ่มาก
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
