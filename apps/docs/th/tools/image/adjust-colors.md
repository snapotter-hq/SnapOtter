---
description: "ปรับความสว่าง, คอนทราสต์, ความอิ่มตัว, อุณหภูมิ, สี, แชนเนล และใช้เอฟเฟกต์สี"
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: b9d7b8daed14
---

# Adjust Colors {#adjust-colors}

เครื่องมือปรับสีแบบครอบคลุมที่รวมความสว่าง, คอนทราสต์, การเปิดรับแสง, ความอิ่มตัว, อุณหภูมิ, โทนสี, การหมุนเฉดสี, ระดับต่อแชนเนล และเอฟเฟกต์แบบคลิกเดียว (ขาวดำ, ซีเปีย, กลับสี) ไว้ในเอนด์พอยต์เดียว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

รับข้อมูลแบบ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | การปรับความสว่าง (-100 ถึง 100) |
| contrast | number | No | `0` | การปรับคอนทราสต์ (-100 ถึง 100) |
| exposure | number | No | `0` | การเปิดรับแสง / แกมมาโทนกลาง (-100 ถึง 100) |
| saturation | number | No | `0` | ความอิ่มตัวของสี (-100 ถึง 100) |
| temperature | number | No | `0` | สมดุลแสงขาว: เย็น/น้ำเงิน ถึง อุ่น/ส้ม (-100 ถึง 100) |
| tint | number | No | `0` | การปรับโทนสี: เขียว ถึง ม่วงแดง (-100 ถึง 100) |
| hue | number | No | `0` | การหมุนเฉดสีเป็นองศา (-180 ถึง 180) |
| sharpness | number | No | `0` | ความแรงของการเพิ่มความคม (0 ถึง 100) |
| red | number | No | `100` | ระดับแชนเนลสีแดง (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |
| green | number | No | `100` | ระดับแชนเนลสีเขียว (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |
| blue | number | No | `100` | ระดับแชนเนลสีน้ำเงิน (0 ถึง 200, 100 = ไม่เปลี่ยนแปลง) |
| effect | string | No | `"none"` | เอฟเฟกต์สี: `none`, `grayscale`, `sepia`, `invert` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

ใช้ลุควินเทจโทนอุ่น:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Notes {#notes}

- พารามิเตอร์ทั้งหมดมีค่าเริ่มต้นเป็นค่ากลาง จึงปรับได้เฉพาะที่ต้องการ
- การปรับจะใช้ตามลำดับนี้: ความสว่าง, คอนทราสต์, การเปิดรับแสง, ความอิ่มตัว/เฉดสี, อุณหภูมิ/โทนสี, ความคม, แชนเนล, เอฟเฟกต์
- อุณหภูมิใช้เมทริกซ์การรวมสีขนาด 3x3 บนแกนน้ำเงิน-ส้ม และเขียว-ม่วงแดง
- การเปิดรับแสงแมปกับฟังก์ชันแกมมาของ Sharp (ค่าบวกทำให้โทนกลางสว่างขึ้น ค่าลบทำให้มืดลง)
- เอนด์พอยต์นี้ยังตอบสนองที่พาธเดิม `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` และ `/api/v1/tools/image/color-effects` ทั้งหมดใช้สคีมาเดียวกัน
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
