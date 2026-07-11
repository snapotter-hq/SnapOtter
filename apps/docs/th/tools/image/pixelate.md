---
description: "ใส่เอฟเฟกต์พิกเซลกับทั้งภาพหรือเฉพาะบริเวณที่กำหนด"
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: 5195281aa98a
---

# Pixelate {#pixelate}

ใส่เอฟเฟกต์พิกเซลกับทั้งภาพหรือเฉพาะบริเวณสี่เหลี่ยมที่กำหนด มีประโยชน์สำหรับปิดบังเนื้อหาที่ละเอียดอ่อน เช่น ใบหน้า ป้ายทะเบียนรถ หรือข้อมูลส่วนบุคคล

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

รับ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| blockSize | integer | No | `12` | ขนาดบล็อกพิกเซล (2-128) ค่ายิ่งมากยิ่งได้พิกเซลที่หยาบขึ้น |
| region | object | No | - | จำกัดการทำพิกเซลไว้เฉพาะสี่เหลี่ยม (ดูด้านล่าง) |

### Region Object {#region-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| left | integer | Yes | ระยะเยื้องด้านซ้ายเป็นพิกเซล (>= 0) |
| top | integer | Yes | ระยะเยื้องด้านบนเป็นพิกเซล (>= 0) |
| width | integer | Yes | ความกว้างของบริเวณเป็นพิกเซล (>= 1) |
| height | integer | Yes | ความสูงของบริเวณเป็นพิกเซล (>= 1) |

## Example Request {#example-request}

ทำพิกเซลทั้งภาพ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

ทำพิกเซลเฉพาะบริเวณที่กำหนด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
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

- เมื่อไม่ระบุ `region` ทั้งภาพจะถูกทำพิกเซล
- พิกัดของบริเวณเป็นพิกเซลสัมพันธ์กับมุมบนซ้ายของรูปภาพ บริเวณต้องอยู่ภายในขอบเขตของรูปภาพ
- รูปแบบเอาต์พุตจะตรงกับรูปแบบอินพุต อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสโดยอัตโนมัติก่อนการประมวลผล
