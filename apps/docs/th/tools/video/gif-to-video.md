---
description: "แปลง GIF แบบเคลื่อนไหวเป็นวิดีโอ MP4, WebM หรือ MOV"
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 81937820f0ee
---

# GIF to Video {#gif-to-video}

แปลง GIF แบบเคลื่อนไหวเป็นไฟล์วิดีโอ MP4, WebM หรือ MOV ที่กะทัดรัด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์ GIF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | รูปแบบเอาต์พุต: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- การแปลง GIF เป็นวิดีโอโดยทั่วไปจะลดขนาดไฟล์ลง 80-90% ในขณะที่คงคุณภาพของภาพไว้เท่าเดิม
- รับเฉพาะไฟล์ GIF แบบเคลื่อนไหว ภาพนิ่งควรใช้เครื่องมือ Convert สำหรับรูปภาพ
- MP4 และ MOV ใช้การเข้ารหัส H.264 ส่วน WebM ใช้ VP9
