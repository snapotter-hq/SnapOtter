---
description: "ประทับรูปภาพลายเซ็นที่อัปโหลดลงบน PDF โดยใช้ตำแหน่งวางที่ปรับให้เป็นค่าปกติตามหน้า"
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: f2ec8fd8d328
---

# Sign PDF {#sign-pdf}

ประทับรูปภาพลายเซ็น PNG ที่อัปโหลดหนึ่งภาพขึ้นไปลงบนหน้าใดก็ได้ของ PDF เส้นทางนี้ใช้สัญญา multipart แบบกำหนดเอง เพราะต้องการทั้ง PDF, รูปภาพลายเซ็นหนึ่งภาพขึ้นไป และพิกัดการวางตำแหน่ง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

รับข้อมูลแบบ multipart form data โดย PDF ถูกส่งมาเป็น `file` ลายเซ็นถูกส่งมาเป็น `sig0`, `sig1` และอื่น ๆ ต่อไป ส่วนตำแหน่งวางถูกส่งมาในฟิลด์ JSON `placements`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ PDF ที่จะเซ็น |
| sig0 | file | Yes | - | รูปภาพลายเซ็นแรก รูปภาพเพิ่มเติมใช้ `sig1`, `sig2` และอื่น ๆ ต่อไป |
| placements | JSON string | Yes | - | อาร์เรย์ของอ็อบเจกต์การวางตำแหน่ง: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | UUID ที่ไม่บังคับสำหรับติดตามความคืบหน้าผ่าน SSE |
| fileId | string | No | - | ID คลังไฟล์ที่ไม่บังคับ เพื่อบันทึกผลลัพธ์ที่เซ็นแล้วเป็นเวอร์ชันใหม่ |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | ดัชนีรูปภาพลายเซ็น `0` แมปกับ `sig0` |
| page | integer | ดัชนีหน้า PDF เริ่มนับจากศูนย์ |
| x | number | ตำแหน่งซ้ายเป็นสัดส่วนของหน้า |
| y | number | ตำแหน่งบนเป็นสัดส่วนของหน้า |
| w | number | ความกว้างของลายเซ็นเป็นสัดส่วนของหน้า |
| h | number | ความสูงของลายเซ็นเป็นสัดส่วนของหน้า |

พิกัดใช้จุดกำเนิดที่มุมบนซ้าย ค่าอาจล้นออกไปนอกขอบหน้าเล็กน้อย ตัวเรนเดอร์ PDF จะตัดตราประทับสุดท้ายให้พอดีกับหน้า

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

หากคำขอไม่สามารถเสร็จสิ้นภายในหน้าต่างการรอแบบซิงโครนัส API จะคืนค่า:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

เชื่อมต่อกับ `/api/v1/jobs/<jobId>/progress` และดาวน์โหลดผลลัพธ์เมื่องานเสร็จสมบูรณ์

## Notes {#notes}

- รูปแบบอินพุต PDF ที่รองรับ: `.pdf`
- รูปภาพลายเซ็นต้องเป็นไฟล์รูปภาพที่ถูกต้อง โดยทั่วไปคือ PNG ที่มีความโปร่งใส
- รับรูปภาพลายเซ็นได้สูงสุด 100 ภาพและตำแหน่งวางได้สูงสุด 100 ตำแหน่ง
- `sign-pdf` เป็นเส้นทางแบบกำหนดเองและไม่ใช้ฟิลด์ JSON `settings` มาตรฐานของเครื่องมือ
