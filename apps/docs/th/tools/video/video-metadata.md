---
description: "ลบเมทาดาทาออกจากวิดีโอและรายงานสิ่งที่พบ"
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 82fb16d4f68a
---

# Clean Video Metadata {#clean-video-metadata}

ลบเมทาดาทา (วันที่สร้าง พิกัด GPS รุ่นกล้อง แท็กซอฟต์แวร์ ฯลฯ) ออกจากวิดีโอและรายงานสิ่งที่ถูกลบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอ เครื่องมือนี้ไม่มีการตั้งค่าที่กำหนดค่าได้

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ โดยจะลบเมทาดาทาทั้งหมดออกจากคอนเทนเนอร์วิดีโอ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- เมทาดาทาที่ถูกลบรวมถึงเวลาที่สร้าง ข้อมูล GPS/ตำแหน่ง ข้อมูลกล้อง/อุปกรณ์ และแท็กซอฟต์แวร์
- สตรีมวิดีโอและเสียงจะถูกคัดลอกโดยไม่เข้ารหัสใหม่ จึงไม่มีการสูญเสียคุณภาพ
- มีประโยชน์ต่อความเป็นส่วนตัวก่อนแชร์วิดีโอสู่สาธารณะ
