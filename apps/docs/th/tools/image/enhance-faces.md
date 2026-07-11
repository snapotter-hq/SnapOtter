---
description: "ฟื้นฟูและทำให้ใบหน้าที่เบลอหรือคุณภาพต่ำในภาพคมชัดขึ้นด้วยโมเดล AI GFPGAN และ CodeFormer"
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 8669c8887c49
---

# Face Enhancement {#face-enhancement}

ฟื้นฟูและปรับปรุงใบหน้าในภาพด้วยโมเดล AI (GFPGAN/CodeFormer)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**การประมวลผล:** แบบอะซิงโครนัส (ส่งคืน 202, ดึงสถานะจาก `/api/v1/jobs/{jobId}/progress` ผ่าน SSE)

**ชุดโมเดล:** `upscale-enhance` (5-6 GB) และ `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| model | string | No | `"auto"` | โมเดลที่จะใช้: `auto`, `gfpgan`, `codeformer` |
| strength | number | No | `0.8` | ความแรงของการปรับปรุง (0-1) ค่าที่สูงกว่าจะให้การปรับปรุงที่แรงกว่า |
| onlyCenterFace | boolean | No | `false` | ปรับปรุงเฉพาะใบหน้าที่อยู่ตรงกลาง/โดดเด่นที่สุด |
| sensitivity | number | No | `0.5` | ความไวในการตรวจจับใบหน้า (0-1) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
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
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes {#notes}

- ต้องใช้ทั้งชุดโมเดล `upscale-enhance` (5-6 GB) และชุดโมเดล `face-detection` (200-300 MB)
- GFPGAN ให้การปรับปรุงที่เชิงรุกกว่า ส่วน CodeFormer รักษาอัตลักษณ์ได้ดีกว่า `auto` เลือกโมเดลที่ดีที่สุดสำหรับอินพุต
- เอาต์พุตเป็นรูปแบบ PNG เสมอเพื่อคุณภาพสูงสุด
- ระบบจะสร้างตัวอย่าง WebP ควบคู่ไปกับเอาต์พุตความละเอียดเต็มเพื่อการแสดงผลที่เร็วขึ้นในส่วนหน้า
- พารามิเตอร์ `strength` ผสมใบหน้าที่ปรับปรุงแล้วกับต้นฉบับ ใช้ค่าที่ต่ำกว่า (0.3-0.5) สำหรับการปรับปรุงเล็กน้อย และค่าที่สูงกว่า (0.7-1.0) สำหรับการฟื้นฟูที่แรงขึ้น
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
