---
description: "รวมภาพหนึ่งภาพหรือมากกว่าเป็นเอกสาร PDF พร้อมตัวเลือกขนาดหน้า ทิศทาง และขนาดไฟล์เป้าหมาย"
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 92e3ea0833c0
---

# Image to PDF {#image-to-pdf}

รวมภาพหนึ่งภาพหรือมากกว่าเป็นเอกสาร PDF รองรับขนาดหน้าหลายแบบ ทิศทาง ระยะขอบ และการกำหนดขนาดไฟล์เป้าหมายที่เป็นทางเลือกผ่านการปรับคุณภาพ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพหนึ่งไฟล์หรือมากกว่า และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"A4"` | ขนาดหน้า: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | No | `"portrait"` | ทิศทางหน้า: `portrait` หรือ `landscape` |
| margin | number | No | `20` | ระยะขอบหน้าเป็นจุด (0-500) |
| targetSize | object | No | - | ข้อจำกัดขนาดไฟล์เป้าหมาย (ดูด้านล่าง) |
| collate | boolean | No | `true` | รวมภาพทั้งหมดเป็น PDF เดียว หากเป็น `false` จะสร้าง PDF หนึ่งไฟล์ต่อภาพ |

### Target Size Object {#target-size-object}

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| value | number | Yes | ค่าขนาดเป้าหมาย |
| unit | string | Yes | หน่วย: `KB` หรือ `MB` |

ขนาดเป้าหมายต่ำสุดคือ 50 KB

## Example Request {#example-request}

PDF หลายภาพพื้นฐาน:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

พร้อมขนาดไฟล์เป้าหมาย:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

PDF หนึ่งไฟล์ต่อภาพ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Example Response (Collated) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Example Response (Non-Collated) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Example Response (With Target Size) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Notes {#notes}

- ภาพจะถูกจัดวางตรงกลางหน้าและปรับขนาดให้พอดีภายในระยะขอบในขณะที่รักษาสัดส่วนภาพ ภาพจะไม่ถูกขยาย
- เมื่อ `collate` เป็น `false` แต่ละภาพจะกลายเป็นไฟล์ PDF แยกกัน และการดาวน์โหลดจะเป็นไฟล์ ZIP ที่มี PDF ทั้งหมด
- ฟีเจอร์ขนาดเป้าหมายใช้การค้นหาแบบไบนารีซ้ำๆ บนระดับคุณภาพ JPEG (10-95) เพื่อหาคุณภาพที่ดีที่สุดที่พอดีกับงบประมาณ
- ภาพโปร่งใสจะถูกทำให้เรียบลงเป็นสีขาวก่อนฝังใน PDF
- รูปแบบนำเข้าที่รองรับ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG และอื่นๆ
- ทิศทาง EXIF จะถูกใช้โดยอัตโนมัติก่อนการฝัง
