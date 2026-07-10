---
description: "แทนที่พื้นหลังรูปภาพด้วยสีทึบหรือไล่ระดับสีโดยใช้ AI"
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 529ea9ee0438
---

# Background Replace {#background-replace}

แทนที่พื้นหลังของรูปภาพด้วยสีทึบหรือไล่ระดับสี โมเดล AI จะตรวจจับวัตถุ, ลบพื้นหลังเดิม และวางวัตถุลงบนพื้นหลังที่คุณเลือก

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

รับข้อมูลแบบ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"color"` | โหมดพื้นหลัง: `color` หรือ `gradient` |
| color | string | No | `"#ffffff"` | สีพื้นหลังแบบ hex (เมื่อ backgroundType เป็น `color`) |
| gradientColor1 | string | No | - | สีไล่ระดับแบบ hex สีแรก |
| gradientColor2 | string | No | - | สีไล่ระดับแบบ hex สีที่สอง |
| gradientAngle | integer | No | `180` | มุมไล่ระดับสีเป็นองศา (0-360) |
| feather | integer | No | `0` | รัศมีการเบลอขอบ (0-20) |
| format | string | No | `"png"` | รูปแบบเอาต์พุต: `png` หรือ `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

ติดตามความคืบหน้าผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` เมื่องานเสร็จสมบูรณ์ สตรีม SSE จะปล่อยเหตุการณ์ `completed` พร้อม URL สำหรับดาวน์โหลด

## Notes {#notes}

- นี่เป็นเครื่องมือที่ขับเคลื่อนด้วย AI ซึ่งส่งคืน `202 Accepted` และประมวลผลแบบอะซิงโครนัส เชื่อมต่อกับเอนด์พอยต์ SSE เพื่อรับการอัปเดตความคืบหน้าและผลลัพธ์สุดท้าย
- ต้องติดตั้งชุดฟีเจอร์ **background-removal** ส่งคืน `501` หากไม่มีชุดนี้
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
- เอาต์พุตเริ่มต้นเป็น PNG เพื่อรักษาความโปร่งใสรอบ ๆ วัตถุ
