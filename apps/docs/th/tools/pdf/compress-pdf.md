---
description: "ลดขนาดไฟล์ PDF โดยการบีบอัดรูปภาพที่ฝังอยู่"
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 2eabdfdf7f55
---

# Compress PDF {#compress-pdf}

ลดขนาดไฟล์ PDF ด้วยการลดความละเอียดของรูปภาพที่ฝังอยู่ เลือกได้ระหว่างแถบเลื่อนปรับคุณภาพหรือขนาดไฟล์เป้าหมาย

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | โหมดการบีบอัด: `quality` หรือ `targetSize` |
| quality | integer | No | `75` | คุณภาพการบีบอัด 1-100 (ค่ายิ่งสูง = บีบอัดน้อยลง) ใช้ในโหมด `quality` |
| targetSizeKb | number | No | - | ขนาดไฟล์เป้าหมายเป็นกิโลไบต์ ใช้ในโหมด `targetSize` |

## Example Request {#example-request}

บีบอัดตามคุณภาพ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

บีบอัดให้ได้ขนาดเป้าหมาย:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- ในโหมด `quality` ค่ายิ่งต่ำจะได้ไฟล์ที่เล็กลงแต่รูปภาพเสื่อมคุณภาพมากขึ้น
- ในโหมด `targetSize` การค้นหาแบบไบนารีจะหาค่า DPI สูงสุดที่พอดีกับขนาดที่ต้องการ
- หากการบีบอัดจะทำให้ไฟล์ใหญ่ขึ้น ระบบจะคืนไบต์ต้นฉบับกลับมาโดยไม่เปลี่ยนแปลง
- เนื้อหาที่เป็นข้อความและเวกเตอร์จะไม่ได้รับผลกระทบ มีเพียงรูปภาพแรสเตอร์ที่ฝังอยู่เท่านั้นที่ถูกลดความละเอียด
