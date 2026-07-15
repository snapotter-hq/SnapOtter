---
description: "เพิ่มความคมชัดของภาพด้วยวิธี adaptive, unsharp mask หรือ high-pass พร้อมตัวเลือกการลดสัญญาณรบกวน"
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: ef763699aca0
---

# เพิ่มความคมชัดของภาพ {#sharpening}

เครื่องมือเพิ่มความคมชัดขั้นสูงพร้อมสามวิธี: adaptive (รับรู้ขอบภาพอย่างชาญฉลาด), unsharp mask (radius/amount แบบคลาสสิก) และ high-pass (เน้นพื้นผิว) มีการลดสัญญาณรบกวนในตัวเพื่อป้องกันสิ่งแปลกปลอมจากการเพิ่มความคมชัด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

รับ multipart form data พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| method | string | No | `"adaptive"` | อัลกอริทึมเพิ่มความคมชัด: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | No | `1.0` | Adaptive: ค่า Gaussian sigma (0.5 ถึง 10) |
| m1 | number | No | `1.0` | Adaptive: การเพิ่มความคมชัดในพื้นที่เรียบ (0 ถึง 10) |
| m2 | number | No | `3.0` | Adaptive: การเพิ่มความคมชัดในพื้นที่ขรุขระ (0 ถึง 20) |
| x1 | number | No | `2.0` | Adaptive: เกณฑ์แบ่งพื้นที่เรียบ/ขรุขระ (0 ถึง 10) |
| y2 | number | No | `12` | Adaptive: การเพิ่มความคมชัดสูงสุดในพื้นที่เรียบ (0 ถึง 50) |
| y3 | number | No | `20` | Adaptive: การเพิ่มความคมชัดสูงสุดในพื้นที่ขรุขระ (0 ถึง 50) |
| amount | number | No | `100` | Unsharp mask: ปริมาณการเพิ่มความคมชัด (0 ถึง 1000) |
| radius | number | No | `1.0` | Unsharp mask: รัศมีการเบลอเป็นพิกเซล (0.1 ถึง 5) |
| threshold | number | No | `0` | Unsharp mask: ความต่างของความสว่างขั้นต่ำที่จะเพิ่มความคมชัด (0 ถึง 255) |
| strength | number | No | `50` | High-pass: ความแรงของฟิลเตอร์ (0 ถึง 100) |
| kernelSize | number | No | `3` | High-pass: ขนาด convolution kernel (3 หรือ 5) |
| denoise | string | No | `"off"` | การลดสัญญาณรบกวนก่อนเพิ่มความคมชัด: `off`, `light`, `medium`, `strong` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Unsharp mask พร้อม threshold เพื่อปกป้องพื้นที่เรียบ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notes {#notes}

- ใช้เฉพาะพารามิเตอร์ที่เกี่ยวข้องกับวิธีที่เลือกเท่านั้น ตัวอย่างเช่น `amount`, `radius` และ `threshold` จะถูกละเว้นเมื่อ `method` เป็น `adaptive`
- วิธี adaptive ใช้การเพิ่มความคมชัดแบบ adaptive ที่มีอยู่ในตัวของ Sharp พร้อมกำหนดพฤติกรรมพื้นที่เรียบ/ขรุขระได้
- ตัวเลือก `denoise` จะทำการลดสัญญาณรบกวนก่อนเพิ่มความคมชัด เพื่อป้องกันการขยายสัญญาณรบกวน/เกรน
- การเพิ่มความคมชัดแบบ high-pass ดึงรายละเอียดที่ละเอียดออกมาโดยลบเวอร์ชันที่เบลอออกจากต้นฉบับ แล้วผสมกลับเข้าไป
- รูปแบบผลลัพธ์จะตรงกับรูปแบบไฟล์ต้นฉบับ ไฟล์ HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
