---
description: "ครอบตัดรูปภาพเป็นวงกลมที่อยู่กึ่งกลางพร้อมมุมโปร่งใส"
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 3c84574ccda3
---

# Circle Crop {#circle-crop}

ครอบตัดรูปภาพเป็นวงกลมที่อยู่กึ่งกลางพร้อมมุมโปร่งใส รองรับการปรับซูม, ระยะเยื้อง, ขอบ และขนาดเอาต์พุต

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

รับข้อมูลแบบ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | ปัจจัยการซูม (1-5); ค่าที่สูงกว่าจะครอบตัดแน่นขึ้น |
| offsetX | number | No | `0.5` | ตำแหน่งกึ่งกลางแนวนอน (0-1) |
| offsetY | number | No | `0.5` | ตำแหน่งกึ่งกลางแนวตั้ง (0-1) |
| borderWidth | integer | No | `0` | ความกว้างของขอบเป็นพิกเซล (0-200) |
| borderColor | string | No | `"#ffffff"` | สีขอบเป็น hex |
| background | string | No | `"transparent"` | การเติมมุม: `"transparent"` หรือสี hex |
| outputSize | integer | No | - | มิติสี่เหลี่ยมจัตุรัสสุดท้ายเป็นพิกเซล (16-4096) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- เอาต์พุตเป็น PNG เสมอเพื่อรักษามุมโปร่งใส (เว้นแต่ `background` ถูกตั้งเป็นสีทึบ)
- วงกลมถูกจารึกภายในมิติที่สั้นกว่าของรูปภาพ ใช้ `zoom` เพื่อครอบตัดแน่นขึ้น และ `offsetX`/`offsetY` เพื่อเลื่อนพื้นที่ที่มองเห็น
- เมื่อระบุ `outputSize` ผลลัพธ์จะถูกปรับขนาดเป็นมิติสี่เหลี่ยมจัตุรัสนั้นหลังการครอบตัด
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
