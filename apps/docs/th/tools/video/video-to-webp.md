---
description: "แปลงคลิปวิดีโอเป็นภาพ WebP แบบเคลื่อนไหว"
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: 1259ed8ae506
---

# Video to WebP {#video-to-webp}

แปลงคลิปวิดีโอเป็นภาพ WebP แบบเคลื่อนไหว พร้อมกำหนดค่าอัตราเฟรม ความกว้าง และคุณภาพได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | อัตราเฟรมเอาต์พุต (1-30) |
| width | integer | No | `480` | ความกว้างเอาต์พุตเป็นพิกเซล (16-1920) ความสูงจะปรับสเกลตามสัดส่วน |
| quality | integer | No | `75` | คุณภาพการบีบอัด WebP (1-100) |
| loop | boolean | No | `true` | วนเล่นภาพเคลื่อนไหว |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- WebP แบบเคลื่อนไหวสร้างไฟล์ที่เล็กกว่า GIF พร้อมรองรับสีได้ดีกว่า (พาเลตต์ 24-bit เทียบกับ 8-bit)
- ค่า `quality` ที่ต่ำลงจะสร้างไฟล์ที่เล็กกว่าโดยแลกกับความคมชัดของภาพ
- ตั้ง `loop` เป็น `false` สำหรับภาพเคลื่อนไหวที่ควรเล่นครั้งเดียวแล้วหยุด
