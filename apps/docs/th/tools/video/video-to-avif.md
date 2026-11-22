---
description: "แปลงคลิปวิดีโอเป็นภาพ AVIF แบบเคลื่อนไหว"
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: e9b80b7d9ff0
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

แปลงคลิปวิดีโอเป็นภาพ AVIF แบบเคลื่อนไหว พร้อมกำหนดค่าอัตราเฟรม ความกว้าง คุณภาพ และช่วงของคลิปได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | อัตราเฟรมเอาต์พุต (1-30) |
| width | integer | No | `480` | ความกว้างเอาต์พุตเป็นพิกเซล (64-1280) ความสูงจะปรับสเกลตามสัดส่วน |
| startS | number | No | `0` | จุดเริ่มต้นของคลิปเป็นวินาที |
| durationS | number | No | `5` | ความยาวคลิปเป็นวินาที (สูงสุด 60) |
| quality | integer | No | `50` | คุณภาพ AVIF (1-100) |
| loop | boolean | No | `true` | วนเล่นภาพเคลื่อนไหว |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

การเข้ารหัส AV1 ช้ากว่า GIF หรือ WebP เครื่องมือนี้จึงมักตอบกลับ `202` พร้อมงานที่ติดตามความคืบหน้าได้ผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress` คลิปสั้นอาจเสร็จภายในช่วงเวลารอแบบ sync และส่งผลลัพธ์กลับมาโดยตรง:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- AVIF แบบเคลื่อนไหวไม่มีค่าลิขสิทธิ์ และมักมีขนาดเล็กกว่า WebP หรือ GIF แบบเคลื่อนไหวที่คุณภาพภาพเท่ากัน
- เบราว์เซอร์รุ่นปัจจุบันเล่น AVIF แบบเคลื่อนไหวได้ โปรแกรมดูภาพบนเดสก์ท็อปบางตัวแสดงเฉพาะเฟรมแรก
- แทร็กเสียงจะถูกตัดออก
