---
description: "ซ่อมรอยขีดข่วน รอยฉีก และความเสียหายบนภาพถ่ายเก่าด้วยไปป์ไลน์ AI สำหรับการฟื้นฟู การปรับแต่งใบหน้า และการลงสี"
i18n_source_hash: 3de13284216c
i18n_provenance: human
i18n_output_hash: 3cfaa58fa5a1
---

# Photo Restoration {#photo-restoration}

ซ่อมรอยขีดข่วน รอยฉีก และความเสียหายบนภาพถ่ายเก่าโดยใช้ไปป์ไลน์ AI แบบหลายขั้นตอน รวมการซ่อมรอยขีดข่วน การปรับแต่งใบหน้า การลดสัญญาณรบกวน และการลงสีตามต้องการ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/restore-photo`

**Processing:** แบบอะซิงโครนัส (คืนค่า 202, poll `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**Model bundle:** `photo-restoration` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| scratchRemoval | boolean | No | `true` | ลบรอยขีดข่วนและความเสียหายบนพื้นผิว |
| faceEnhancement | boolean | No | `true` | ปรับแต่งใบหน้าในภาพที่ฟื้นฟูแล้ว |
| fidelity | number | No | `0.7` | ความแม่นยำในการปรับแต่งใบหน้า (0-1) ค่ายิ่งสูงยิ่งรักษาลักษณะดั้งเดิมไว้มากขึ้น |
| denoise | boolean | No | `true` | ใช้การลดสัญญาณรบกวนกับผลลัพธ์ที่ฟื้นฟูแล้ว |
| denoiseStrength | number | No | `25` | ความเข้มในการลดสัญญาณรบกวน (0-100) |
| colorize | boolean | No | `false` | ลงสีภาพที่ฟื้นฟูแล้ว (สำหรับภาพขาวดำ) |
| colorizeStrength | number | No | `85` | ความเข้มของการลงสี (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/restore-photo \
  -F "file=@damaged-old-photo.jpg" \
  -F 'settings={"scratchRemoval":true,"faceEnhancement":true,"fidelity":0.6,"colorize":true}'
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
data: {"phase":"processing","stage":"Removing scratches...","percent":30}
```

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
    "downloadUrl": "/api/v1/download/{jobId}/damaged-old-photo_restored.jpg",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 200000,
    "processedSize": 350000,
    "width": 1200,
    "height": 900,
    "steps": ["scratch_removal", "face_enhancement", "denoise", "colorize"],
    "scratchCoverage": 12.5,
    "facesEnhanced": 2,
    "isGrayscale": true,
    "colorized": true
  }
}
```

## Notes {#notes}

- ต้องติดตั้ง model bundle `photo-restoration` (4-5 GB)
- ไปป์ไลน์รันขั้นตอน AI หลายขั้นตอนตามลำดับ: การซ่อมรอยขีดข่วน การปรับแต่งใบหน้า (GFPGAN) การลดสัญญาณรบกวน และการลงสีตามต้องการ
- อาร์เรย์ `steps` ในผลลัพธ์แสดงว่าขั้นตอนการประมวลผลใดถูกดำเนินการจริง
- `scratchCoverage` คือเปอร์เซ็นต์โดยประมาณของพื้นที่ภาพที่มีความเสียหายจากรอยขีดข่วน
- `fidelity` ควบคุมว่าใบหน้าจะได้รับการปรับแต่งเข้มข้นเพียงใดเทียบกับการรักษารูปลักษณ์ดั้งเดิม ค่าที่ต่ำกว่าให้การปรับแต่งที่เข้มข้นกว่า ค่าที่สูงกว่าจะอนุรักษ์นิยมมากกว่า
- ตัวเลือก `colorize` จะตรวจจับโดยอัตโนมัติว่าภาพเป็นขาวดำหรือไม่ แฟล็ก `isGrayscale` ในผลลัพธ์ยืนยันการตรวจจับนี้
- รูปแบบเอาต์พุตจะตรงกับรูปแบบอินพุตโดยอัตโนมัติ
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR, HDR และ AVIF ผ่านการถอดรหัสอัตโนมัติ
