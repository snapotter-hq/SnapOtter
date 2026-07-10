---
description: "แปลงหน้า PDF เป็นรูปภาพคุณภาพสูง"
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 215e1cab2cdc
---

# PDF to Image {#pdf-to-image}

แปลงหน้า PDF เป็นรูปภาพแรสเตอร์คุณภาพสูง รองรับการเลือกหน้า หลายรูปแบบผลลัพธ์ การควบคุม DPI และโหมดสี รวมถึงเส้นทางย่อยสำหรับดูข้อมูลและตัวอย่างเพื่อตรวจสอบ PDF ก่อนการแปลง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | รูปแบบผลลัพธ์: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | ความละเอียดการเรนเดอร์ (36 ถึง 2400) DPI ที่สูงขึ้นจะให้รูปภาพที่ใหญ่ขึ้นและมีรายละเอียดมากขึ้น |
| quality | number | No | 85 | คุณภาพผลลัพธ์สำหรับรูปแบบที่สูญเสียข้อมูล (1 ถึง 100) |
| colorMode | string | No | `"color"` | โหมดสี: `color`, `grayscale`, `bw` (เกณฑ์ขาวดำ) |
| pages | string | No | `"all"` | การเลือกหน้า: `all`, หน้าเดียว (`3`), ช่วง (`1-5`) หรือคั่นด้วยจุลภาค (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

คืนจำนวนหน้าของ PDF โดยไม่เรนเดอร์หน้าใด ๆ

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

คืนภาพขนาดย่อ JPEG ความละเอียดต่ำของทุกหน้าเป็น base64 data URL มีประโยชน์ในการสร้าง UI สำหรับเลือกหน้า

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- ใช้ MuPDF ในการเรนเดอร์ PDF ให้ผลลัพธ์คุณภาพสูงพร้อมการเรนเดอร์ฟอนต์และกราฟิกเวกเตอร์ที่ถูกต้อง
- PDF ที่ป้องกันด้วยรหัสผ่านไม่รองรับและจะคืนข้อผิดพลาด 400
- พารามิเตอร์ `pages` รองรับไวยากรณ์ที่ยืดหยุ่น:
  - `"all"` หรือ `""` - ทุกหน้า
  - `"3"` - หน้าเดียว
  - `"1-5"` - ช่วงหน้า (รวมปลายทั้งสอง)
  - `"1,3,5-8"` - ผสมหน้าเดี่ยวและช่วง
- หมายเลขหน้าเริ่มนับจาก 1 การระบุหน้าเกินความยาวของเอกสารจะคืนข้อผิดพลาด 400
- เอนด์พอยต์หลักจะสร้างทั้งการดาวน์โหลดหน้าแต่ละหน้าและไฟล์ ZIP ที่มีทุกหน้าที่เลือกเสมอ
- เอนด์พอยต์ตัวอย่างจะเรนเดอร์ที่ 72 DPI และปรับขนาดเป็นความกว้าง 300px เพื่อสร้างภาพขนาดย่ออย่างรวดเร็ว ภาพขนาดย่อเป็น JPEG ที่คุณภาพ 60%
- เอนด์พอยต์ตัวอย่างจะเคารพการกำหนดค่าเซิร์ฟเวอร์ `MAX_PDF_PAGES` ซึ่งจำกัดจำนวนภาพขนาดย่อที่สร้างขึ้น
- สำหรับเอกสารขนาดใหญ่ที่ DPI สูง เวลาประมวลผลจะเพิ่มขึ้นตามสัดส่วน พิจารณาใช้ DPI ต่ำ (150) สำหรับใช้งานบนเว็บ และ DPI สูง (300-600) สำหรับงานพิมพ์
