---
description: "แปลง GIF เคลื่อนไหวเป็น WebP และในทางกลับกัน โดยรักษาทุกเฟรมไว้"
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: b7b263942cab
---

# GIF/WebP Converter {#gif-webp-converter}

แปลงไฟล์ GIF เคลื่อนไหวเป็น WebP และในทางกลับกัน โดยรักษาทุกเฟรมและจังหวะเวลาของภาพเคลื่อนไหว ภาพเคลื่อนไหว WebP โดยทั่วไปมีขนาดเล็กกว่า GIF ที่เทียบเท่ากันประมาณ 25-35%

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ GIF หรือ WebP และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | integer | No | `80` | คุณภาพผลลัพธ์สำหรับการเข้ารหัส WebP (1-100) |
| lossless | boolean | No | `false` | ใช้การบีบอัด WebP แบบ lossless |
| resizePercent | integer | No | `100` | ปรับสัดส่วนผลลัพธ์ตามเปอร์เซ็นต์ (10-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Notes {#notes}

- รับเฉพาะไฟล์ `.gif` และ `.webp` เท่านั้น เครื่องมือนี้ไม่รองรับรูปแบบภาพอื่นๆ
- ทิศทางการแปลงเป็นแบบอัตโนมัติ: อินพุต GIF ผลิตเอาต์พุต WebP และอินพุต WebP ผลิตเอาต์พุต GIF
- ตัวเลือก `quality` และ `lossless` ใช้ได้เฉพาะเมื่อเข้ารหัสเป็น WebP เมื่อแปลงเป็น GIF ผลลัพธ์จะใช้จานสี GIF มาตรฐาน
- ใช้ `resizePercent` เพื่อลดขนาด (และขนาดไฟล์) ของภาพเคลื่อนไหวขนาดใหญ่
