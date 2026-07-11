---
description: "แก้ไข PNG ที่โปร่งใสปลอมด้วยการแมตต์ด้วย AI (BiRefNet) เพื่อสร้างค่า alpha ที่แท้จริง พร้อมการล้างขอบด้วย defringe"
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: e4c42c6529af
---

# PNG Transparency Fixer {#png-transparency-fixer}

แก้ไข PNG ที่โปร่งใสปลอมได้ในคลิกเดียว ใช้การแมตต์ด้วย AI (โมเดล BiRefNet HR Matting) เพื่อสร้างความโปร่งใส alpha ที่แท้จริง พร้อมการประมวลผลภายหลังด้วย defringe เพื่อล้างขอบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**การประมวลผล:** แบบอะซิงโครนัส (คืนค่า 202, สำรวจ `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**ชุดโมเดล:** `background-removal` (4-5 GB)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| defringe | number | No | `30` | ความเข้มของ defringe (0-100) ลบพิกเซลขอบกึ่งโปร่งใสรอบขอบภาพ |
| outputFormat | string | No | `"png"` | รูปแบบผลลัพธ์: `png` หรือ `webp` |
| removeWatermark | boolean | No | `false` | ใช้การประมวลผลลบลายน้ำก่อน (median filter) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### ผลลัพธ์สุดท้าย (ผ่าน SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Notes {#notes}

- จำเป็นต้องติดตั้งชุดโมเดล `background-removal` (4-5 GB)
- ใช้ `birefnet-hr-matting` เป็นโมเดลหลักสำหรับการแมตต์ alpha คุณภาพสูง จะย้อนกลับไปใช้ `birefnet-general` หากโมเดล HR หน่วยความจำไม่พอ
- ตัวเลือก `defringe` ลบพิกเซลขอบกึ่งโปร่งใสที่การแมตต์ด้วย AI บางครั้งทิ้งไว้รอบเส้นผม ขน และขอบที่ละเอียด โดยทำงานด้วยการเบลอช่อง alpha และปรับพิกเซลที่มีความเชื่อมั่นต่ำให้เป็นศูนย์
- ตัวเลือก `removeWatermark` ใช้ขั้นตอนการประมวลผลก่อนด้วย median filter เป็นการลดลายน้ำเบื้องต้น ไม่ใช่เครื่องมือลบลายน้ำโดยเฉพาะ
- ให้ผลลัพธ์เป็น PNG หรือ WebP แบบไม่สูญเสียข้อมูลเท่านั้น (ทั้งคู่รองรับความโปร่งใส alpha)
- รองรับรูปแบบไฟล์นำเข้า HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
