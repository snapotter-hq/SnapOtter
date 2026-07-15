---
description: "หมุนรูปภาพในมุมใดก็ได้และพลิกในแนวนอนหรือแนวตั้ง"
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 6b9c6e8bbef1
---

# หมุนและพลิกภาพ {#rotate-flip}

หมุนรูปภาพในมุมใดก็ได้ และ/หรือพลิกในแนวนอนหรือแนวตั้ง การหมุนและการพลิกสามารถทำร่วมกันในคำขอเดียวได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

รับ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | มุมการหมุนเป็นองศา (ตามเข็มนาฬิกา) รับค่าตัวเลขใดก็ได้ |
| horizontal | boolean | No | `false` | พลิกรูปภาพในแนวนอน (สะท้อนกระจก) |
| vertical | boolean | No | `false` | พลิกรูปภาพในแนวตั้ง |

## Example Request {#example-request}

หมุน 90 องศาตามเข็มนาฬิกา:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

พลิกในแนวนอน:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

หมุนและพลิกพร้อมกัน:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- การหมุนจะถูกใช้ก่อน แล้วจึงเป็นการพลิก
- การหมุนที่ไม่ใช่ 90 องศา (เช่น 45 องศา) จะขยายผืนภาพให้พอดีกับรูปภาพที่หมุนแล้ว โดยเติมด้วยความโปร่งใสหรือสีดำขึ้นอยู่กับรูปแบบเอาต์พุต
- ค่าที่ใช้บ่อย: 90, 180, 270 สำหรับการหมุนแบบเสี้ยวรอบ
- การวางแนวตาม EXIF จะถูกใช้โดยอัตโนมัติก่อนการประมวลผล ดังนั้นการหมุนจึงสัมพันธ์กับการวางแนวที่มองเห็น
