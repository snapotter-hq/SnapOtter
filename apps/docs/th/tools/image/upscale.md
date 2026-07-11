---
description: "ขยายภาพ 2 เท่าถึง 4 เท่าด้วย Real-ESRGAN AI super-resolution พร้อมรักษารายละเอียดที่ละเอียด"
i18n_source_hash: 150032e99476
i18n_provenance: human
i18n_output_hash: e74cb2ee5031
---

# Image Upscaling {#image-upscaling}

การเพิ่มความละเอียดด้วย AI super-resolution ที่ใช้ Real-ESRGAN ขยายภาพ 2 เท่าถึง 4 เท่าพร้อมรักษารายละเอียด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/upscale`

**การประมวลผล:** แบบอะซิงโครนัส (คืนค่า 202, สำรวจ `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**ชุดโมเดล:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| scale | number | No | `2` | ตัวคูณการขยาย (เช่น 2, 3, 4) |
| model | string | No | `"auto"` | โมเดลที่จะใช้ (เช่น `auto`, ชื่อโมเดลเฉพาะ) |
| faceEnhance | boolean | No | `false` | ใช้การปรับปรุงใบหน้าระหว่างการขยาย |
| denoise | number | No | `0` | ความแรงของการลดสัญญาณรบกวน (0 = ปิด) |
| format | string | No | `"auto"` | รูปแบบผลลัพธ์: `auto`, `png`, `jpg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | number | No | `95` | คุณภาพผลลัพธ์ (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/upscale \
  -F "file=@photo.jpg" \
  -F 'settings={"scale":4,"model":"auto","faceEnhance":true,"format":"png"}'
```

## Response {#response}

### การตอบกลับเริ่มต้น (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### ความคืบหน้า (SSE ที่ `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Upscaling...","percent":60}
```

### ผลลัพธ์สุดท้าย (ผ่าน SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_4x.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 120000,
    "processedSize": 2400000,
    "width": 4096,
    "height": 4096,
    "method": "realesrgan-x4plus"
  }
}
```

## Notes {#notes}

- จำเป็นต้องติดตั้งชุดโมเดล `upscale-enhance` (5-6 GB)
- ใช้ Real-ESRGAN เมื่อพร้อมใช้งาน จะย้อนกลับไปใช้การประมาณค่าแบบ Lanczos หากไม่มีโมเดล AI
- ตัวเลือก `faceEnhance` ใช้การฟื้นฟูใบหน้าด้วย GFPGAN ระหว่างการขยายเพื่อคุณภาพใบหน้าที่ดีขึ้น
- สำหรับรูปแบบผลลัพธ์ที่เบราว์เซอร์แสดงตัวอย่างไม่ได้ (HEIC, JXL, TIFF) จะสร้างตัวอย่าง WebP ควบคู่ไปกับผลลัพธ์หลัก
- รองรับรูปแบบไฟล์นำเข้า HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
