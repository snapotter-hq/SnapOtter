---
description: "สร้าง placeholder ภาพคุณภาพต่ำขนาดเล็กพร้อม base64 data URI"
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: a2ae5a3853e7
---

# LQIP Placeholder {#lqip-placeholder}

สร้าง placeholder ภาพคุณภาพต่ำ (LQIP) ขนาดเล็กจากภาพต้นฉบับ คืนค่าเป็นไฟล์ placeholder ขนาดเล็กพร้อมกับ base64 data URI, แท็ก HTML `<img>` ที่พร้อมใช้งาน และ CSS `background-image` snippet สำหรับการฝังทันที

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `16` | ความกว้างเป้าหมายเป็นพิกเซล (4-64) |
| blur | number | No | `2` | รัศมีการเบลอสำหรับกลยุทธ์การเบลอ (0-20) |
| strategy | string | No | `"blur"` | กลยุทธ์ placeholder: `blur`, `pixelate`, หรือ `solid` |
| format | string | No | `"webp"` | รูปแบบผลลัพธ์: `webp`, `png`, หรือ `jpeg` |
| quality | integer | No | `50` | คุณภาพผลลัพธ์ (1-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## Notes {#notes}

- ฟิลด์ `dataUri` มี data URI ที่สมบูรณ์ พร้อมใช้งานในแอตทริบิวต์ `src` หรือ CSS โดยไม่ต้องมีคำขอเพิ่มเติม
- ฟิลด์ `html` และ `css` ให้ snippet แบบคัดลอกวางสำหรับกรณีการใช้งานทั่วไป
- กลยุทธ์ `blur` ผลิตภาพขนาดย่อที่นุ่มนวลและเบลอ กลยุทธ์ `pixelate` สร้างโมเสกแบบบล็อก กลยุทธ์ `solid` คืนค่าสีเฉลี่ยเดียว
- ขนาด placeholder ทั่วไปคือ 200-500 ไบต์ ทำให้เหมาะสำหรับการฝังโดยตรงใน HTML
- ความสูงจะถูกคำนวณโดยอัตโนมัติเพื่อรักษาสัดส่วนภาพของภาพต้นฉบับ
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสโดยอัตโนมัติก่อนการประมวลผล
