---
description: "แปลงภาพระหว่างรูปแบบต่าง ๆ รวมถึงรูปแบบสมัยใหม่อย่าง AVIF, JXL และ HEIC"
i18n_source_hash: 562f8270e8c3
i18n_provenance: human
i18n_output_hash: d311eca561a0
---

# Convert {#convert}

แปลงภาพระหว่างรูปแบบต่าง ๆ รองรับรูปแบบเว็บทั่วไปรวมถึงรูปแบบเฉพาะทางอย่าง HEIC, JXL, BMP, ICO, JP2, QOI และ PSD

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | รูปแบบเป้าหมาย: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | No | - | คุณภาพเอาต์พุต (1-100) ใช้กับรูปแบบที่มีการสูญเสียข้อมูลอย่าง jpg, webp, avif, heic |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Notes |
|--------|------|-------|
| jpg | Lossy | JPEG, ความเข้ากันได้ดีที่สุด |
| png | Lossless | รองรับความโปร่งใส |
| webp | Both | รูปแบบเว็บสมัยใหม่ บีบอัดได้ดี |
| avif | Lossy | รูปแบบยุคใหม่ บีบอัดได้ยอดเยี่ยม |
| tiff | Both | เวิร์กโฟลว์งานพิมพ์/การจัดพิมพ์ |
| gif | Lossless | จำกัดที่ 256 สี |
| heic / heif | Lossy | รูปแบบของระบบนิเวศ Apple |
| jxl | Both | JPEG XL, รูปแบบยุคใหม่ |
| bmp | Lossless | บิตแมปแบบไม่บีบอัด |
| ico | Lossless | รูปแบบไอคอน Windows |
| jp2 | Lossy | JPEG 2000 |
| qoi | Lossless | รูปแบบ Quite OK Image |
| psd | Layered | Adobe Photoshop (ต้องใช้ ImageMagick) |
| ppm | Lossless | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vector | Encapsulated PostScript |
| tga | Lossless | รูปแบบภาพ Targa |

## Example Request {#example-request}

แปลงเป็น WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

แปลงเป็น PNG (ไม่สูญเสียข้อมูล):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notes {#notes}

- นามสกุลชื่อไฟล์เอาต์พุตจะถูกอัปเดตอัตโนมัติให้ตรงกับรูปแบบเป้าหมาย
- อินพุต SVG จะถูกแรสเตอร์ที่ 300 DPI ก่อนการแปลง
- การแปลง PSD ต้องติดตั้ง ImageMagick บนเซิร์ฟเวอร์
- BMP, EPS, ICO, JP2, JXL, PPM, QOI และ TGA ใช้ตัวเข้ารหัส CLI เฉพาะทางและข้ามการประมวลผลด้วย Sharp
- การเข้ารหัส HEIC/HEIF ใช้ไลบรารีตัวเข้ารหัส HEIC ของระบบ
- รูปแบบอินพุตครอบคลุมกว้าง: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, ฯลฯ), PSD, SVG, BMP และอื่น ๆ
