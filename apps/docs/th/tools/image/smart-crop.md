---
description: "การครอปที่รับรู้วัตถุ ใบหน้า และเอนโทรปี ซึ่งจัดเฟรมภาพอย่างชาญฉลาดด้วย Sharp และการตรวจจับใบหน้าด้วย AI"
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: bc9863725e0d
---

# Smart Crop {#smart-crop}

การครอปที่รับรู้วัตถุ รับรู้ใบหน้า หรือแบบตัดขอบ ใช้กลยุทธ์ attention/entropy ของ Sharp และการตรวจจับใบหน้าด้วย AI เพื่อจัดเฟรมอย่างชาญฉลาด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**การประมวลผล:** แบบอะซิงโครนัส (คืนค่า 202, สำรวจ `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**ชุดโมเดล:** `face-detection` (200-300 MB) - จำเป็นเฉพาะสำหรับโหมด `face` เท่านั้น

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| mode | string | No | `"subject"` | โหมดการครอป: `subject`, `face`, `trim` (ค่าเดิม `attention` และ `content` จะแมปไปยัง `subject` และ `trim`) |
| strategy | string | No | `"attention"` | กลยุทธ์สำหรับโหมด subject: `attention` หรือ `entropy` |
| width | integer | No | - | ความกว้างเป้าหมายเป็นพิกเซล |
| height | integer | No | - | ความสูงเป้าหมายเป็นพิกเซล |
| padding | integer | No | `0` | เปอร์เซ็นต์ระยะขอบรอบวัตถุ (0-50) |
| facePreset | string | No | `"head-shoulders"` | พรีเซ็ตการจัดเฟรมใบหน้า: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | No | `0.5` | ความไวในการตรวจจับใบหน้า (0-1) |
| threshold | integer | No | `30` | เกณฑ์โหมด trim สำหรับการตรวจจับพื้นหลัง (0-255) |
| padToSquare | boolean | No | `false` | เติมขอบผลลัพธ์ที่ตัดแล้วให้เป็นสี่เหลี่ยมจัตุรัส |
| padColor | string | No | `"#ffffff"` | สีพื้นหลังสำหรับการเติมขอบ |
| targetSize | integer | No | - | ขนาดเป้าหมายสำหรับผลลัพธ์ที่เติมขอบ (พิกเซล) |
| quality | integer | No | - | คุณภาพผลลัพธ์ (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### ผลลัพธ์สุดท้าย (ผ่าน SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modes {#modes}

### Subject Mode {#subject-mode}
ใช้กลยุทธ์ attention หรือ entropy ของ Sharp เพื่อค้นหาบริเวณที่น่าสนใจทางสายตามากที่สุด แล้วครอปรอบบริเวณนั้น

### Face Mode {#face-mode}
ตรวจจับใบหน้าด้วย AI จากนั้นจัดเฟรมการครอปรอบใบหน้าที่ตรวจพบโดยใช้ `facePreset` ที่ระบุ หากตรวจไม่พบใบหน้าจะย้อนกลับไปใช้โหมด subject (กลยุทธ์ attention)

### Trim Mode {#trim-mode}
ลบขอบ/พื้นหลังที่มีสีสม่ำเสมอออกจากภาพ สามารถเลือกเติมขอบผลลัพธ์ให้เป็นสี่เหลี่ยมจัตุรัสด้วยสีพื้นหลังและขนาดเป้าหมายที่ระบุได้

## Notes {#notes}

- เครื่องมือนี้ใช้ factory `createToolRoute` พร้อม `executionHint: "long"` จึงคืนค่า 202 พร้อมความคืบหน้าผ่าน SSE
- โหมด face จำเป็นต้องใช้ชุดโมเดล `face-detection` (200-300 MB)
- โหมด subject และ trim ทำงานได้โดยไม่ต้องใช้ชุดโมเดล AI ใดๆ
- `facePreset` กำหนดว่าการครอปจะจัดเฟรมใบหน้าที่ตรวจพบกระชับเพียงใด: `closeup` กระชับที่สุด ส่วน `half-body` กว้างที่สุด
- หากไม่ระบุความกว้าง/ความสูง จะใช้ค่าเริ่มต้น 1080x1080
