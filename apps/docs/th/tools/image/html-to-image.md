---
description: "จับภาพหน้าเว็บหรือ HTML snippet เป็นภาพคุณภาพสูงพร้อมการจำลองอุปกรณ์"
i18n_source_hash: 1e49d070ea2e
i18n_provenance: human
i18n_output_hash: 0b7e4980dd30
---

# HTML to Image {#html-to-image}

จับภาพ URL หน้าเว็บหรือเนื้อหา HTML ดิบเป็นภาพหน้าจอ รองรับการจำลองอุปกรณ์ (เดสก์ท็อป แท็บเล็ต มือถือ) การจับภาพทั้งหน้า และรูปแบบผลลัพธ์หลายแบบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

รับ **JSON body** (ไม่ใช่ multipart) ไม่จำเป็นต้องอัปโหลดไฟล์

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Conditional | - | URL ที่จะจับภาพ (ต้องเป็น URL ที่ถูกต้อง) |
| html | string | Conditional | - | เนื้อหา HTML ดิบที่จะเรนเดอร์ (1 ถึง 5,000,000 อักขระ) |
| format | string | No | `"png"` | รูปแบบผลลัพธ์: `jpg`, `png`, `webp` |
| quality | number | No | `90` | คุณภาพผลลัพธ์สำหรับรูปแบบ lossy (1 ถึง 100) |
| fullPage | boolean | No | `false` | จับภาพหน้าที่เลื่อนได้ทั้งหมด ไม่ใช่เฉพาะ viewport |
| devicePreset | string | No | `"desktop"` | การจำลองอุปกรณ์: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | No | `1280` | ความกว้าง viewport แบบกำหนดเองเป็นพิกเซล (320 ถึง 3840 ใช้เมื่อ devicePreset เป็น `custom`) |
| viewportHeight | number | No | `720` | ความสูง viewport แบบกำหนดเองเป็นพิกเซล (320 ถึง 2160 ใช้เมื่อ devicePreset เป็น `custom`) |

ต้องระบุ `url` หรือ `html` อย่างใดอย่างหนึ่ง แต่ไม่ใช่ทั้งสองอย่าง

### Device Presets {#device-presets}

| Preset | Width | Height | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | No |
| `tablet` | 768 | 1024 | No |
| `mobile` | 375 | 812 | Yes |
| `custom` | (ผู้ใช้ระบุ) | (ผู้ใช้ระบุ) | No |

## Example Request {#example-request}

จับภาพหน้าเว็บ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

เรนเดอร์เนื้อหา HTML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

## Notes {#notes}

- ต้องติดตั้ง Chromium บนเซิร์ฟเวอร์ คืนค่า HTTP 503 หากบริการเบราว์เซอร์ไม่พร้อมใช้งาน
- URL จะถูกตรวจสอบเพื่อป้องกันการโจมตี SSRF (ที่อยู่เครือข่ายส่วนตัว/ภายในจะถูกบล็อก)
- endpoint นี้ถูกจำกัดอัตราไว้ที่ 120 คำขอต่อชั่วโมง
- `originalSize` จะเป็น 0 เสมอ เนื่องจากเครื่องมือนี้สร้างภาพจาก URL/HTML
- ชื่อไฟล์ผลลัพธ์คือ `screenshot.<format>`
- หากหน้าใช้เวลาโหลดนานเกินไป คำขอจะคืนค่า HTTP 504 (gateway timeout)
- หากบริการเบราว์เซอร์ล่มซ้ำๆ จะถูกปิดใช้งานชั่วคราวและคืนค่า HTTP 503 พร้อมโค้ด `BROWSER_CRASHED`
