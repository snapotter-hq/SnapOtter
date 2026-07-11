---
description: "สร้างไอคอน favicon และไอคอนแอปในทุกขนาดมาตรฐานจากภาพต้นฉบับ"
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: a8fe9ee39cb7
---

# Favicon Generator {#favicon-generator}

สร้างชุดไฟล์ favicon และไอคอนแอปที่ครบถ้วนจากภาพต้นฉบับ ผลิตทุกขนาดมาตรฐานที่จำเป็นสำหรับเบราว์เซอร์ อุปกรณ์ Apple และ Android พร้อมกับ web manifest และ HTML snippet

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/favicon`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพหนึ่งไฟล์หรือมากกว่า และฟิลด์ JSON `settings` ที่เป็นทางเลือก

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| background | string | No | - | สีพื้นหลังแบบ hex (เช่น `"#ffffff"`) เมื่อกำหนดค่า ไอคอนจะถูกทำให้เรียบลงบนสีนี้ |
| padding | integer | No | `0` | เปอร์เซ็นต์ระยะขอบรอบเนื้อหาไอคอน (0 ถึง 40) |
| radius | integer | No | `0` | เปอร์เซ็นต์รัศมีมุมสำหรับไอคอนมุมโค้ง (0 ถึง 50) |
| sizes | integer[] | No | - | จำกัดผลลัพธ์ให้อยู่ในขนาดพิกเซลที่ระบุ (เช่น `[16, 32, 180]`) ละไว้เพื่อสร้างทุกขนาดมาตรฐาน |
| themeColor | string | No | `"#ffffff"` | สีธีมแบบ hex สำหรับ web manifest |

## Generated Files {#generated-files}

สำหรับภาพนำเข้าแต่ละภาพ จะผลิตไฟล์ต่อไปนี้:

| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | ไอคอนแท็บเบราว์เซอร์ |
| `favicon-32x32.png` | 32x32 | ไอคอนแท็บเบราว์เซอร์ (HiDPI) |
| `favicon-48x48.png` | 48x48 | ทางลัดบนเดสก์ท็อป |
| `apple-touch-icon.png` | 180x180 | หน้าจอหลักของ iOS |
| `android-chrome-192x192.png` | 192x192 | หน้าจอหลักของ Android |
| `android-chrome-512x512.png` | 512x512 | หน้าจอ splash ของ Android |
| `favicon.ico` | 32x32 | รูปแบบ ICO แบบเดิม |
| `manifest.json` | - | Web app manifest พร้อมการอ้างอิงไอคอน |
| `favicon-snippet.html` | - | แท็ก HTML link ที่พร้อมใช้งาน |

## Example Request {#example-request}

ภาพต้นฉบับเดียวที่มีมุมโค้งและระยะขอบ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

ภาพต้นฉบับหลายภาพ (แต่ละภาพได้ชุดของตัวเองในโฟลเดอร์ย่อย):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Example Response {#example-response}

การตอบกลับเป็นไฟล์ ZIP ที่สตรีมมาโดยตรง ส่วนหัวของการตอบกลับคือ:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## HTML Snippet Included {#html-snippet-included}

ไฟล์ ZIP มีไฟล์ `favicon-snippet.html` ที่คุณสามารถวางลงในส่วน `<head>` ของ HTML ได้:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notes {#notes}

- ภาพต้นฉบับจะถูกปรับขนาดโดยใช้โหมด fit แบบ `cover` ซึ่งหมายความว่าจะถูกครอบตัดให้เต็มแต่ละขนาดสี่เหลี่ยมจัตุรัส เพื่อผลลัพธ์ที่ดีที่สุด ให้ใช้ภาพต้นฉบับที่เป็นสี่เหลี่ยมจัตุรัส
- เมื่ออัปโหลดหลายไฟล์ แต่ละไฟล์จะได้โฟลเดอร์ย่อยของตัวเองใน ZIP (ตั้งชื่อตามไฟล์ต้นฉบับ)
- สำหรับการอัปโหลดไฟล์เดียว ผลลัพธ์ทั้งหมดจะอยู่ที่รากของ ZIP โดยไม่มีโฟลเดอร์ย่อย
- ไฟล์ที่ไม่ผ่านการตรวจสอบหรือถอดรหัสไม่ได้จะถูกข้ามไป และจะมีไฟล์ `skipped-files.txt` รวมอยู่ใน ZIP เพื่ออธิบายปัญหา
- รูปแบบนำเข้าที่รองรับ: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD และอื่นๆ
- ทิศทาง EXIF จะถูกใช้โดยอัตโนมัติก่อนการปรับขนาด
