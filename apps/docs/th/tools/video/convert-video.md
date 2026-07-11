---
description: "แปลงวิดีโอระหว่าง MP4, MOV, WebM, AVI และ MKV"
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 986fc3037ab7
---

# Convert Video {#convert-video}

แปลงวิดีโอระหว่างรูปแบบ MP4, MOV, WebM, AVI และ MKV พร้อมพรีเซ็ตคุณภาพที่กำหนดค่าได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings` นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | รูปแบบเอาต์พุต: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | พรีเซ็ตคุณภาพ: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- พรีเซ็ตคุณภาพ `high` ให้ความคมชัดของภาพดีที่สุดแต่ไฟล์ใหญ่กว่า ส่วนพรีเซ็ต `small` บีบอัดอย่างมากเพื่อขนาดไฟล์ที่เล็กที่สุด
- เอาต์พุต WebM ใช้การเข้ารหัส VP9 ส่วน MP4 และ MOV ใช้ H.264 ส่วน AVI และ MKV มีให้ใช้สำหรับเวิร์กโฟลว์แบบเก่าหรือการเก็บถาวร
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
