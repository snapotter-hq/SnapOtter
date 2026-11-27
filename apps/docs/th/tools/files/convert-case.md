---
description: "เปลี่ยนข้อความเป็นตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก Title Sentence case และอื่นๆ"
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 07018a9af58d
i18n_hash_version: 2
---

# Convert Case {#convert-case}

วางข้อความ เลือกรูปแบบตัวพิมพ์ แล้วคัดลอกผลลัพธ์ ข้อความจะถูกส่งไปยังเซิร์ฟเวอร์ SnapOtter ของคุณเองเท่านั้น ไม่ส่งไปที่อื่น

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

รับเนื้อหา JSON ไม่ใช่ multipart form data และตอบกลับด้วยข้อความที่แปลงแล้วแทนไฟล์ให้ดาวน์โหลด

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (จำเป็น) | ข้อความที่จะแปลง สูงสุด 1,000,000 ตัวอักษร |
| `mode` | string | (จำเป็น) | หนึ่งในโหมดด้านล่าง |
| `locale` | string | (ไม่มี) | แท็กภาษา BCP 47 เช่น `tr` หรือ `de` สำหรับตัวอักษรที่รูปแบบตัวพิมพ์ขึ้นอยู่กับภาษา หากไม่ระบุ การเปลี่ยนตัวพิมพ์จะเหมือนกันทุกภาษา |

| Mode | Input | Output |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Example Response {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Notes {#notes}

- `title` คงคำภาษาอังกฤษสั้นๆ (a, an, and, of, the, to และคำที่คล้ายกัน) เป็นตัวพิมพ์เล็ก เว้นแต่จะอยู่ต้นหรือท้ายบรรทัด ส่วน `capitalized` ทำให้ทุกคำขึ้นต้นด้วยตัวพิมพ์ใหญ่
- `sentence` เริ่มประโยคใหม่ที่จุดเริ่มต้นของข้อความ หลังการขึ้นบรรทัดใหม่ และหลัง `.`, `!`, `?` หรือ `…` ที่ตามด้วยช่องว่าง ดังนั้นจุดใน `snapotter.com` หรือ `3.5` จึงไม่นับ
- `camel`, `pascal`, `snake` และ `kebab` แยกคำตามช่องว่าง เครื่องหมายวรรคตอน และจุดที่ตัวพิมพ์เปลี่ยน (`XMLHttpRequest` กลายเป็น `xml_http_request`) และแปลงแต่ละบรรทัดแยกกัน
- เมื่อตั้ง `locale` เป็น `tr` `i` จะเป็นตัวพิมพ์ใหญ่ `İ` และ `I` จะเป็นตัวพิมพ์เล็ก `ı` ส่วน `ß` ในภาษาเยอรมันจะเป็นตัวพิมพ์ใหญ่ `SS` ในทุกโลแคล
- เว็บแอปส่งภาษาของอินเทอร์เฟซปัจจุบันเป็น `locale`
