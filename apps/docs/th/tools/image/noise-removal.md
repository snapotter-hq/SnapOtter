---
description: "การกำจัดสัญญาณรบกวนและเกรนด้วย AI พร้อมตัวเลือกคุณภาพหลายระดับ"
i18n_source_hash: f0dfc876e0e0
i18n_provenance: human
i18n_output_hash: 7cca6387bd1c
---

# Noise Removal {#noise-removal}

การกำจัดสัญญาณรบกวนและเกรนด้วย AI พร้อมตัวเลือกคุณภาพหลายระดับ โดยใช้ Python sidecar (โมเดล SCUNet)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/noise-removal`

**Processing:** แบบอะซิงโครนัส (คืนค่า 202, poll `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**Model bundle:** `upscale-enhance` (5-6 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| tier | string | No | `"balanced"` | ระดับคุณภาพ: `quick`, `balanced`, `quality`, `maximum` |
| strength | number | No | `50` | ความเข้มในการลดสัญญาณรบกวน (0-100) |
| detailPreservation | number | No | `50` | ปริมาณรายละเอียดที่ต้องการรักษาไว้ (0-100) ค่ายิ่งสูงยิ่งรักษาพื้นผิวไว้มากขึ้น |
| colorNoise | number | No | `30` | ความเข้มในการลดสัญญาณรบกวนสี (0-100) |
| format | string | No | `"original"` | รูปแบบเอาต์พุต: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | `90` | คุณภาพการเข้ารหัสเอาต์พุต (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/noise-removal \
  -F "file=@noisy-photo.jpg" \
  -F 'settings={"tier":"quality","strength":60,"detailPreservation":70,"colorNoise":40}'
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
data: {"phase":"processing","stage":"Denoising...","percent":65}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/noisy-photo_denoised.jpg",
    "originalSize": 500000,
    "processedSize": 380000
  }
}
```

## Notes {#notes}

- ต้องติดตั้ง model bundle `upscale-enhance` (5-6 GB)
- ระดับคุณภาพจะแลกความเร็วกับคุณภาพ: `quick` เร็วที่สุดพร้อมการลดสัญญาณรบกวนพื้นฐาน ส่วน `maximum` ใช้วิธีแบบหลายรอบที่ละเอียดที่สุด
- พารามิเตอร์ `detailPreservation` มีความสำคัญสำหรับวัตถุที่มีพื้นผิว (ผ้า ผม ใบไม้) ค่าที่สูงขึ้นจะป้องกันไม่ให้ตัวลดสัญญาณรบกวนลบรายละเอียดเล็ก ๆ ออกไป
- เมื่อ `format` ถูกตั้งเป็น `"original"` รูปแบบเอาต์พุตจะตรงกับรูปแบบไฟล์อินพุต
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
