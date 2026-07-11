---
description: "ครอปทุกหน้าของ PDF ด้วยระยะขอบที่เท่ากัน"
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: cc4d0b14eb47
---

# Crop PDF {#crop-pdf}

ครอปทุกหน้าของ PDF โดยใช้ระยะขอบที่เท่ากัน ตัดเนื้อหาออกจากแต่ละขอบเท่า ๆ กัน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | ระยะขอบครอปที่เท่ากันเป็นพอยต์ (0-2000) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- ค่าระยะขอบมีหน่วยเป็นพอยต์ของ PDF (1 พอยต์ = 1/72 นิ้ว)
- ระยะขอบเดียวกันจะถูกใช้กับทั้งสี่ขอบของทุกหน้า
- ระยะขอบเท่ากับ `0` จะลบระยะขอบครอปเดิมทั้งหมด แสดงกล่องสื่อ (media box) เต็มขนาด
