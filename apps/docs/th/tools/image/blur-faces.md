---
description: "ตรวจจับและเบลอใบหน้าในรูปภาพโดยอัตโนมัติด้วยการตรวจจับใบหน้าด้วย AI เพื่อความเป็นส่วนตัวและการทำให้ไม่ระบุตัวตนที่สอดคล้องกับ GDPR"
i18n_source_hash: 314e3e16a422
i18n_provenance: human
i18n_output_hash: aa94f9bb65a1
---

# เบลอใบหน้าและข้อมูลส่วนตัว {#face-pii-blur}

ตรวจจับและเบลอใบหน้าในรูปภาพโดยอัตโนมัติโดยใช้การตรวจจับใบหน้าที่ขับเคลื่อนด้วย AI (MediaPipe)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-faces`

**การประมวลผล:** แบบอะซิงโครนัส (ส่งคืน 202, สำรวจ `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**ชุดโมเดล:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| blurRadius | number | No | `30` | รัศมีการเบลอที่ใช้กับใบหน้าที่ตรวจพบ (1-100) |
| sensitivity | number | No | `0.5` | ความไวในการตรวจจับใบหน้า (0-1) ค่าที่ต่ำกว่าจะตรวจจับใบหน้าน้อยลงด้วยความมั่นใจที่สูงกว่า |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-faces \
  -F "file=@group-photo.jpg" \
  -F 'settings={"blurRadius":40,"sensitivity":0.3}'
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
data: {"phase":"processing","stage":"Detecting faces...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/group-photo_blurred.jpg",
    "originalSize": 450000,
    "processedSize": 420000,
    "facesDetected": 3,
    "faces": [
      {"x": 100, "y": 50, "w": 80, "h": 80},
      {"x": 300, "y": 60, "w": 75, "h": 75},
      {"x": 500, "y": 55, "w": 85, "h": 85}
    ]
  }
}
```

### No Faces Detected {#no-faces-detected}

หากไม่พบใบหน้า ผลลัพธ์จะมีคำเตือน:

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "facesDetected": 0,
    "warning": "No faces detected in this image. Try increasing detection sensitivity."
  }
}
```

## Notes {#notes}

- ต้องติดตั้งชุดโมเดล `face-detection` (200-300 MB)
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุตโดยอัตโนมัติ
- อาร์เรย์ `faces` มีพิกัดกล่องขอบเขต (x, y, width, height) สำหรับใบหน้าที่ตรวจพบแต่ละใบหน้า
- เพิ่ม `sensitivity` (เข้าใกล้ 1.0) เพื่อตรวจจับใบหน้ามากขึ้น รวมถึงใบหน้าที่ถูกบดบังบางส่วน
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
