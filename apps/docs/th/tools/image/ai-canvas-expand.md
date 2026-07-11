---
description: "ขยายผืนผ้าใบของรูปภาพด้วย AI outpainting โดยขยายไปในทิศทางใดก็ได้และเติมพื้นที่ใหม่ให้เข้ากับต้นฉบับ"
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 46e1ef85b530
---

# AI Canvas Expand {#ai-canvas-expand}

ขยายผืนผ้าใบของรูปภาพด้วยการเติมที่ขับเคลื่อนด้วย AI (outpainting) ขยายรูปภาพไปในทิศทางใดก็ได้และเติมพื้นที่ใหม่ด้วยเนื้อหาที่ AI สร้างขึ้นให้เข้ากับรูปภาพเดิม

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**การประมวลผล:** แบบอะซิงโครนัส (ส่งคืน 202, สำรวจ `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**ชุดโมเดล:** `object-eraser-colorize` (1-2 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| extendTop | integer | No | `0` | พิกเซลที่จะขยายด้านบน |
| extendRight | integer | No | `0` | พิกเซลที่จะขยายด้านขวา |
| extendBottom | integer | No | `0` | พิกเซลที่จะขยายด้านล่าง |
| extendLeft | integer | No | `0` | พิกเซลที่จะขยายด้านซ้าย |
| tier | string | No | `"balanced"` | ระดับคุณภาพ: `fast`, `balanced`, `high` |
| format | string | No | `"auto"` | รูปแบบเอาต์พุต: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | No | `95` | คุณภาพเอาต์พุต (1-100) |

อย่างน้อยหนึ่งทิศทางการขยายต้องมากกว่า 0

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
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
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Notes {#notes}

- ต้องติดตั้งชุดโมเดล `object-eraser-colorize` (1-2 GB)
- ใช้ outpainting บนพื้นฐาน LaMa เพื่อสร้างเนื้อหาสำหรับบริเวณที่ขยาย
- พารามิเตอร์ `tier` แลกเปลี่ยนความเร็วกับคุณภาพ: `fast` ให้ผลลัพธ์อย่างรวดเร็วโดยอาจมีสิ่งแปลกปลอม ส่วน `high` ใช้เวลานานกว่าแต่ให้การเติมที่นุ่มนวลและกลมกลืนกว่า
- ค่าการขยายเป็นพิกเซล ขนาดรูปภาพสุดท้ายจะเป็น: ความกว้างต้นฉบับ + extendLeft + extendRight คูณ ความสูงต้นฉบับ + extendTop + extendBottom
- สำหรับรูปแบบเอาต์พุตที่ไม่สามารถแสดงตัวอย่างในเบราว์เซอร์ได้ (HEIC, JXL, TIFF) จะสร้างตัวอย่าง WebP ควบคู่ไปกับเอาต์พุตหลัก
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
