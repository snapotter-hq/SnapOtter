---
description: "แปลงฟอนต์ระหว่าง TTF, OTF, WOFF และ WOFF2"
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: d17d52e738ad
i18n_hash_version: 2
---

# แปลงฟอนต์ {#convert-font}

แปลงไฟล์ฟอนต์ระหว่าง TrueType (TTF), OpenType CFF (OTF), WOFF และ WOFF2 ใช้เพื่อเปลี่ยนฟอนต์เดสก์ท็อปเป็นเว็บฟอนต์ หรือเพื่อได้ TTF จาก OTF สำหรับแอปที่รับเฉพาะ TrueType

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ `.ttf`, `.otf`, `.woff` หรือ `.woff2` และฟิลด์ JSON ชื่อ `settings`

## พารามิเตอร์ {#parameters}

| พารามิเตอร์ | ชนิด | จำเป็น | ค่าเริ่มต้น | คำอธิบาย |
|-----------|------|----------|---------|-------------|
| format | string | ไม่ | `ttf` | รูปแบบเอาต์พุต: `ttf`, `otf`, `woff` หรือ `woff2` |

## ตัวอย่างคำขอ {#example-request}

OTF เป็น TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF เป็น WOFF2 สำหรับเว็บ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## ตัวอย่างการตอบกลับ {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## หมายเหตุ {#notes}

- WOFF และ WOFF2 เป็นตัวห่อแบบบีบอัดรอบข้อมูลฟอนต์ชุดเดียวกัน การแปลงเข้าหรือออกจากรูปแบบเหล่านี้จึงไม่เปลี่ยนเส้นขอบ
- การแปลง OTF เป็น TTF จะเปลี่ยนเส้นโค้งกำลังสาม (CFF) เป็นเส้นโค้งกำลังสองของ TrueType แต่ละเส้นโค้งคลาดจากต้นฉบับไม่เกิน 1 หน่วยฟอนต์ ซึ่งมองไม่เห็นที่ขนาดปกติ แต่การแปลงนี้ย้อนกลับได้ไม่ตรงทุกประการ ส่วนการแปลง TTF เป็น OTF จะคงรูปทรงเส้นโค้งไว้และเพียงปัดจุดควบคุมเป็นหน่วยฟอนต์เต็ม
- สิทธิ์การฝังของฟอนต์ (ฟิลด์ OS/2 `fsType`) คงไว้ตามเดิม
- ไม่รองรับคอลเลกชันฟอนต์ (`.ttc`) ฟอนต์ TrueType แบบแปรผันแปลงเป็น OTF ไม่ได้ และฟอนต์ CFF2 แบบแปรผันแปลงเป็น TTF ไม่ได้ ให้แปลงฟอนต์เหล่านั้นเป็น WOFF หรือ WOFF2 แทน
- การแปลงทำงานใน Python document worker โดยใช้เวลาหมดเวลาเท่ากับเครื่องมือเอกสารอื่น ไม่ได้ทำงานภายในโปรเซสของ API
