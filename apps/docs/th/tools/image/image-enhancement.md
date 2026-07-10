---
description: "ปรับปรุงภาพอัตโนมัติในคลิกเดียวที่วิเคราะห์ภาพและแก้ไขค่าแสง คอนทราสต์ ไวต์บาลานซ์ ความอิ่มตัวของสี และความคมชัด"
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: b05f3760905b
---

# Image Enhancement {#image-enhancement}

ปรับปรุงอัตโนมัติในคลิกเดียวพร้อมการวิเคราะห์อัจฉริยะ วิเคราะห์ภาพและใช้การแก้ไขค่าแสง คอนทราสต์ ไวต์บาลานซ์ ความอิ่มตัวของสี ความคมชัด และการลด noise

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**การประมวลผล:** แบบซิงโครนัส (ใช้ factory `createToolRoute` คืนค่าผลลัพธ์โดยตรง)

**Model bundle:** ไม่จำเป็นสำหรับการปรับปรุงพื้นฐาน bundle `upscale-enhance` (5-6 GB) ใช้เฉพาะเมื่อเปิดใช้งาน `deepEnhance` (สำหรับการลบ noise ด้วย AI ผ่าน SCUNet)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| mode | string | No | `"auto"` | โหมดการปรับปรุง: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | No | `50` | ความเข้มของการปรับปรุงโดยรวม (0-100) |
| corrections | object | No | all `true` | การแก้ไขแบบเลือกสรรที่จะใช้ (ดูด้านล่าง) |
| deepEnhance | boolean | No | `false` | เปิดใช้งานการลบ noise ที่ขับเคลื่อนด้วย AI (ต้องติดตั้งเครื่องมือ `noise-removal`) |

### Corrections Object {#corrections-object}

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| exposure | boolean | `true` | แก้ไขค่าแสงอัตโนมัติ |
| contrast | boolean | `true` | แก้ไขคอนทราสต์อัตโนมัติ |
| whiteBalance | boolean | `true` | แก้ไขไวต์บาลานซ์อัตโนมัติ |
| saturation | boolean | `true` | แก้ไขความอิ่มตัวของสีอัตโนมัติ |
| sharpness | boolean | `true` | เพิ่มความคมชัดอัตโนมัติ |
| denoise | boolean | `true` | ลด noise เล็กน้อย |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Analyze Endpoint {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

วิเคราะห์ภาพและคืนค่าคำแนะนำการแก้ไขโดยไม่ใช้งานจริง

### Parameters {#parameters-1}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| file | file | Yes | ไฟล์ภาพ (multipart) |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Response (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Notes {#notes}

- เครื่องมือนี้ใช้ factory `createToolRoute` แบบซิงโครนัส จึงคืนค่าการตอบกลับมาตรฐาน (ไม่ใช่ 202 async)
- พารามิเตอร์ `mode` ปรับวิธีการถ่วงน้ำหนักการแก้ไข (เช่น โหมดพอร์ตเทรตอ่อนโยนกว่าต่อโทนสีผิว โหมดแลนด์สเคปเพิ่มความอิ่มตัวของสี)
- เมื่อเปิดใช้งาน `deepEnhance` และติดตั้งเครื่องมือ `noise-removal` (SCUNet) จะมีการใช้การลด noise ด้วย AI เพิ่มเติมหลังจากการแก้ไขมาตรฐาน
- endpoint การวิเคราะห์มีประโยชน์สำหรับการดูตัวอย่างว่าจะมีการใช้การแก้ไขใดบ้างก่อนที่จะยืนยัน
- รองรับรูปแบบนำเข้า HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
