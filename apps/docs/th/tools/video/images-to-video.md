---
description: "เปลี่ยนชุดรูปภาพเป็นวิดีโอสไลด์โชว์"
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: aef2becd4214
---

# Images to Video {#images-to-video}

เปลี่ยนชุดรูปภาพเป็นวิดีโอสไลด์โชว์ พร้อมกำหนดค่าระยะเวลาต่อรูป ความละเอียด และอัตราเฟรมได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์รูปภาพตั้งแต่สองไฟล์ขึ้นไปและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | ระยะเวลาแสดงต่อรูปเป็นวินาที (0.5-10) |
| resolution | string | No | `"720p"` | ความละเอียดเอาต์พุต: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | อัตราเฟรมเอาต์พุต (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- รับไฟล์รูปภาพ 2-60 ไฟล์ต่อคำขอ รูปภาพจะปรากฏในวิดีโอตามลำดับการอัปโหลด
- รูปภาพจะถูกปรับขนาดและเติมขอบให้พอดีกับความละเอียดเป้าหมายโดยคงอัตราส่วนภาพไว้
- ตัวเลือกความละเอียด `square` จะสร้างวิดีโอขนาด 1080x1080 ซึ่งมีประโยชน์สำหรับโซเชียลมีเดีย
- รูปแบบเอาต์พุตเป็น MP4 (H.264) เสมอ
