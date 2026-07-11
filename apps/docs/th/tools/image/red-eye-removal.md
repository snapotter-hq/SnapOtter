---
description: "การตรวจจับและแก้ไขตาแดงจากแฟลชกล้องด้วย AI"
i18n_source_hash: 647c6ff1ef7c
i18n_provenance: human
i18n_output_hash: 82b10c7f778e
---

# Red Eye Removal {#red-eye-removal}

การตรวจจับและแก้ไขตาแดงจากแฟลชกล้องด้วย AI

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/red-eye-removal`

**Processing:** แบบอะซิงโครนัส (คืนค่า 202, poll `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**Model bundle:** `face-detection` (200-300 MB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| sensitivity | number | No | `50` | ความไวในการตรวจจับตาแดง (0-100) ค่ายิ่งสูงยิ่งตรวจจับตาแดงที่จางกว่าได้ |
| strength | number | No | `70` | ความเข้มในการแก้ไข (0-100) จะลบสีแดงออกอย่างเข้มข้นเพียงใด |
| format | string | No | - | รูปแบบเอาต์พุต (การแทนที่แบบเสริม) |
| quality | number | No | `90` | คุณภาพเอาต์พุต (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/red-eye-removal \
  -F "file=@flash-photo.jpg" \
  -F 'settings={"sensitivity":60,"strength":80}'
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
data: {"phase":"processing","stage":"Detecting red eyes...","percent":40}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/flash-photo_redeye_fixed.png",
    "originalSize": 280000,
    "processedSize": 290000,
    "facesDetected": 2,
    "eyesCorrected": 4
  }
}
```

## Notes {#notes}

- ต้องติดตั้ง model bundle `face-detection` (200-300 MB)
- ระบบจะตรวจจับใบหน้าก่อน แล้วหาบริเวณดวงตาในแต่ละใบหน้า และสุดท้ายระบุและแก้ไขพิกเซลตาแดง
- จำนวน `facesDetected` บ่งบอกว่าพบใบหน้ากี่ใบหน้า ส่วน `eyesCorrected` คือจำนวนดวงตาทั้งหมดที่ได้รับการแก้ไขตาแดง
- เอาต์พุตเป็น PNG เสมอเพื่อรักษาคุณภาพให้ได้สูงสุด
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
