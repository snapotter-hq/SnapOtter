---
description: "ตัดคลิปออกจากวิดีโอโดยระบุเวลาเริ่มต้นและสิ้นสุด"
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: e5befa0b31e0
---

# Trim Video {#trim-video}

ตัดคลิปออกจากวิดีโอโดยระบุเวลาเริ่มต้นและสิ้นสุดเป็นวินาที พร้อมตัวเลือกสำหรับการตัดที่แม่นยำระดับเฟรม

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | เวลาเริ่มต้นเป็นวินาที (ต้อง >= 0) |
| endS | number | Yes | - | เวลาสิ้นสุดเป็นวินาที (ต้องอยู่หลัง startS) |
| precise | boolean | No | `false` | เข้ารหัสใหม่เพื่อการตัดที่แม่นยำระดับเฟรมแทนการค้นหาตาม keyframe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- เมื่อ `precise` เป็น `false` (ค่าเริ่มต้น) เครื่องมือจะใช้การค้นหาตาม keyframe ซึ่งเร็วแต่อาจเริ่มก่อนเวลาที่ร้องขอไม่กี่เฟรม
- การตั้ง `precise` เป็น `true` จะเข้ารหัสส่วนดังกล่าวใหม่เพื่อขอบเขตเฟรมที่แม่นยำ แต่ใช้เวลานานกว่า
- ค่า `endS` ต้องมากกว่า `startS`
