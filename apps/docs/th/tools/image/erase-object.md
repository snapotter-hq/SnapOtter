---
description: "ลบวัตถุที่ไม่ต้องการออกจากภาพด้วยการเติมภาพด้วย AI (LaMa) โดยใช้มาสก์ของบริเวณที่จะลบเป็นตัวชี้นำ"
i18n_source_hash: 8e2e42a5e4f9
i18n_provenance: human
i18n_output_hash: 30e128e52470
---

# Object Eraser {#object-eraser}

ลบวัตถุที่ไม่ต้องการออกจากภาพด้วยการเติมภาพด้วย AI (โมเดล LaMa) รับภาพและมาสก์ที่ระบุบริเวณที่จะลบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/erase-object`

**การประมวลผล:** แบบอะซิงโครนัส (ส่งคืน 202, ดึงสถานะจาก `/api/v1/jobs/{jobId}/progress` ผ่าน SSE)

**ชุดโมเดล:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพต้นฉบับ (multipart) |
| mask | file | Yes | - | ภาพมาสก์ (ขาว = บริเวณที่จะลบ, ดำ = คงไว้) ต้องอัปโหลดด้วยชื่อฟิลด์ `mask` |
| format | string | No | `"auto"` | รูปแบบเอาต์พุต: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | คุณภาพเอาต์พุต (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/erase-object \
  -F "file=@photo.jpg" \
  -F "mask=@mask.png" \
  -F "format=png" \
  -F "quality=95"
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
data: {"phase":"processing","stage":"Inpainting...","percent":70}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_erased.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 245000,
    "processedSize": 230000
  }
}
```

## Notes {#notes}

- ต้องติดตั้งชุดโมเดล `object-eraser-colorize` ก่อน (1-2 GB)
- มาสก์ต้องมีขนาดเท่ากับภาพต้นฉบับ พิกเซลสีขาวบ่งบอกบริเวณที่จะลบ AI จะเติมด้วยเนื้อหาที่ดูสมเหตุสมผล
- ใช้ LaMa (Large Mask Inpainting) สำหรับการลบวัตถุคุณภาพสูง
- สำหรับรูปแบบเอาต์พุตที่ไม่สามารถแสดงตัวอย่างในเบราว์เซอร์ได้ ระบบจะสร้างตัวอย่าง WebP ควบคู่ไปกับเอาต์พุตหลัก
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
