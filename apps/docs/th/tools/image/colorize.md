---
description: "ลงสีภาพขาวดำหรือภาพโทนสีเทาโดยอัตโนมัติด้วยโมเดล AI DDColor"
i18n_source_hash: 688aa3abbdae
i18n_provenance: human
i18n_output_hash: 0eec48f71b2c
---

# AI Colorization {#ai-colorization}

แปลงภาพขาวดำหรือภาพโทนสีเทาให้เป็นภาพสีเต็มรูปแบบด้วย AI (โมเดล DDColor พร้อมตัวสำรอง OpenCV DNN)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/colorize`

**การประมวลผล:** แบบอะซิงโครนัส (ส่งคืน 202, ดึงสถานะจาก `/api/v1/jobs/{jobId}/progress` ผ่าน SSE)

**ชุดโมเดล:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| intensity | number | No | `1.0` | ความเข้มของสี (0-1) ค่าที่ต่ำกว่าจะให้การลงสีที่นุ่มนวลกว่า |
| model | string | No | `"auto"` | โมเดลที่จะใช้: `auto`, `ddcolor`, `opencv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/colorize \
  -F "file=@old-bw-photo.jpg" \
  -F 'settings={"intensity":0.9,"model":"auto"}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Colorizing...","percent":55}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/old-bw-photo_colorized.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 180000,
    "processedSize": 210000,
    "width": 1920,
    "height": 1080,
    "method": "ddcolor"
  }
}
```

## Notes {#notes}

- ต้องติดตั้งชุดโมเดล `object-eraser-colorize` ก่อน (1-2 GB)
- DDColor ให้ผลลัพธ์คุณภาพสูงกว่าแต่ช้ากว่า ส่วน OpenCV DNN เร็วกว่าโดยมีคุณภาพต่ำกว่าเล็กน้อย `auto` ใช้ DDColor เมื่อพร้อมใช้งานพร้อมตัวสำรอง OpenCV
- พารามิเตอร์ `intensity` ผสมระหว่างภาพโทนสีเทาต้นฉบับกับผลลัพธ์ที่ลงสีด้วย AI ใช้ 1.0 สำหรับสีเต็ม ค่าที่ต่ำกว่าสำหรับลุควินเทจที่ลดความอิ่มตัวของสีบางส่วน
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุตโดยอัตโนมัติ
- สำหรับรูปแบบเอาต์พุตที่ไม่สามารถแสดงตัวอย่างในเบราว์เซอร์ได้ ระบบจะสร้างตัวอย่าง WebP ควบคู่ไปกับเอาต์พุตหลัก
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
