---
description: "แปลงไฟล์ SVG เป็น PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF หรือ JXL ที่ความละเอียดและ DPI ที่กำหนดเอง พร้อมรองรับการทำงานแบบชุด"
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: 2207b6c82f0d
---

# SVG to Raster {#svg-to-raster}

แปลงไฟล์ SVG เป็นรูปแบบภาพแรสเตอร์ (PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF หรือ JXL) ที่ความละเอียดและ DPI ที่กำหนดเอง รองรับการแปลง SVG หลายไฟล์แบบชุดด้วย

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | ความกว้างเป้าหมายเป็นพิกเซล (1 ถึง 65536) รักษาสัดส่วนภาพหากกำหนดเพียงมิติเดียว |
| height | integer | No | - | ความสูงเป้าหมายเป็นพิกเซล (1 ถึง 65536) รักษาสัดส่วนภาพหากกำหนดเพียงมิติเดียว |
| dpi | integer | No | 300 | DPI ในการเรนเดอร์ ควบคุมความหนาแน่นพื้นฐานของการทำแรสเตอร์ (36 ถึง 2400) |
| quality | number | No | 90 | คุณภาพผลลัพธ์สำหรับรูปแบบแบบสูญเสียข้อมูล (1 ถึง 100) |
| backgroundColor | string | No | `"#00000000"` | สีพื้นหลังแบบ hex (6 หรือ 8 อักขระ, 8 อักขระรวมค่า alpha) |
| outputFormat | string | No | `"png"` | รูปแบบผลลัพธ์: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heif`, `jxl` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## Batch Endpoint {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

แปลงไฟล์ SVG หลายไฟล์ในคำขอเดียว คืนค่าเป็นไฟล์ ZIP

### Additional Batch Parameters {#additional-batch-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| clientJobId | string | No | - | job ID ที่ไคลเอนต์กำหนดสำหรับติดตามความคืบหน้า (ไม่บังคับ, สูงสุด 128 อักขระ) |

### Batch Example Request {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### Batch Response {#batch-response}

endpoint แบบชุดจะสตรีมไฟล์ ZIP ออกมาโดยตรงพร้อมส่วนหัว:
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## Notes {#notes}

- รับเฉพาะไฟล์ SVG และ SVGZ เท่านั้น (ตรวจสอบเนื้อหา ไม่ใช่เพียงนามสกุลไฟล์) ไฟล์ SVGZ จะถูกคลายการบีบอัดอัตโนมัติ
- เนื้อหา SVG จะถูกทำความสะอาดก่อนเรนเดอร์เพื่อป้องกัน XSS และการโหลดทรัพยากรภายนอก
- การตั้งค่า `dpi` ควบคุมความหนาแน่นในการทำแรสเตอร์ SVG ค่า DPI ที่สูงขึ้นจะให้มิติพิกเซลที่ใหญ่ขึ้นจาก viewport ของ SVG เดียวกัน
- เมื่อกำหนดทั้ง `width` และ `height` ภาพจะถูกปรับขนาดโดยใช้ `fit: inside` (รักษาสัดส่วนภาพภายในขอบเขต)
- มี `previewUrl` รวมอยู่ในการตอบกลับสำหรับรูปแบบที่เบราว์เซอร์ไม่สามารถแสดงได้เอง (TIFF, HEIF) ตัวอย่างเป็นภาพย่อ WebP ขนาด 1200px
- พื้นหลังเริ่มต้น `#00000000` จะโปร่งใสอย่างสมบูรณ์ ตั้งค่าเป็น `#FFFFFF` สำหรับพื้นหลังสีขาว (มีประโยชน์กับผลลัพธ์ JPEG ที่ไม่รองรับความโปร่งใส)
- การประมวลผลแบบชุดเป็นไปตามการกำหนดค่าเซิร์ฟเวอร์ `MAX_BATCH_SIZE` และใช้ worker ทำงานพร้อมกันเพื่อประสิทธิภาพ
- สามารถติดตามความคืบหน้าของการทำงานแบบชุดได้ผ่าน SSE ที่ `/api/v1/jobs/:jobId/progress`
