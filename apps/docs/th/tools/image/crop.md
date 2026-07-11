---
description: "ครอปภาพโดยการระบุบริเวณด้วยตำแหน่งและขนาด"
i18n_source_hash: aab38ccd7c53
i18n_provenance: human
i18n_output_hash: 2ebe7188a137
---

# Crop {#crop}

ครอปภาพโดยการกำหนดบริเวณสี่เหลี่ยมโดยใช้ตำแหน่งและขนาด รองรับทั้งหน่วยพิกเซลและเปอร์เซ็นต์

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| left | number | Yes | - | ระยะออฟเซ็ต X ของบริเวณครอป (จากขอบซ้าย) |
| top | number | Yes | - | ระยะออฟเซ็ต Y ของบริเวณครอป (จากขอบบน) |
| width | number | Yes | - | ความกว้างของบริเวณครอป |
| height | number | Yes | - | ความสูงของบริเวณครอป |
| unit | string | No | `"px"` | หน่วยสำหรับค่าต่าง ๆ: `px` หรือ `percent` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

ครอปโดยใช้ค่าเปอร์เซ็นต์:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- บริเวณครอปต้องอยู่ภายในขอบเขตของภาพ หากบริเวณขยายเกินภาพ คำขอจะล้มเหลว
- เมื่อใช้หน่วย `percent` ค่าจะแทนเปอร์เซ็นต์ของขนาดภาพ (เช่น `left: 10` หมายถึง 10% จากขอบซ้าย)
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต
- การจัดวางแนว EXIF จะถูกนำมาใช้อัตโนมัติก่อนการครอป ดังนั้นพิกัดจึงสอดคล้องกับการจัดวางแนวที่ถูกต้องเชิงสายตา
