---
description: "เปลี่ยนชุดรูปภาพเป็นวิดีโอสไลด์โชว์ GIF แอนิเมชัน หรือ WebP แอนิเมชัน"
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: c27e54c3d30a
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

เปลี่ยนชุดรูปภาพเป็นวิดีโอสไลด์โชว์ พร้อมกำหนดค่าระยะเวลาต่อรูป ความละเอียด และอัตราเฟรมได้ หรือเปลี่ยนเป็น GIF หรือ WebP แอนิเมชันที่กำหนดเวลาต่อเฟรมและจำนวนรอบการเล่นซ้ำได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์รูปภาพตั้งแต่สองไฟล์ขึ้นไปและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | รูปแบบเอาต์พุต: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | เฉพาะ MP4 ระยะเวลาแสดงต่อรูปเป็นวินาที (0.5-10) |
| resolution | string | No | `"720p"` | เฉพาะ MP4 ความละเอียดเอาต์พุต: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | เฉพาะ MP4 อัตราเฟรมเอาต์พุต (10-60) |
| frameDelayMs | integer | No | `500` | เฉพาะ GIF และ WebP เวลาที่แสดงแต่ละรูปเป็นมิลลิวินาที (20-10000) |
| loop | integer | No | `0` | เฉพาะ GIF และ WebP จำนวนรอบที่แอนิเมชันเล่นซ้ำ ค่า `0` คือเล่นวนไม่สิ้นสุด (0-100) |

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

สร้าง GIF แอนิเมชันที่แสดงแต่ละรูป 200 มิลลิวินาที:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- สำหรับ MP4 รูปภาพจะถูกปรับขนาดและเติมขอบให้พอดีกับความละเอียดเป้าหมายโดยคงอัตราส่วนภาพไว้
- ตัวเลือกความละเอียด `square` จะสร้างวิดีโอขนาด 1080x1080 ซึ่งมีประโยชน์สำหรับโซเชียลมีเดีย
- เอาต์พุต MP4 เป็น H.264 ตั้งชื่อว่า `slideshow.mp4`
- เอาต์พุต GIF และ WebP ใช้ขนาดของรูปแรก รูปที่มีขนาดอื่นจะถูกย่อให้พอดีภายในขนาดนั้น และพื้นที่ที่เหลือจะโปร่งใส ไฟล์ตั้งชื่อว่า `slideshow.gif` หรือ `slideshow.webp`
- GIF เก็บเวลาของเฟรมเป็นหน่วยหนึ่งในร้อยวินาที ดังนั้น `frameDelayMs` จะถูกปัดเป็น 10 มิลลิวินาทีที่ใกล้ที่สุดใน GIF ส่วน WebP เก็บค่าที่แน่นอนไว้
- แอนิเมชันขนาดใหญ่จะถูกปฏิเสธแทนที่จะสร้างให้ ขนาดเฟรมคูณจำนวนรูปต้องไม่เกินขีดจำกัดพิกเซลเดียวกับที่เครื่องมือ GIF ใช้
