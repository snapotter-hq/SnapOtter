---
description: "แปลงไฟล์ Markdown เป็นหน้า HTML แบบสแตนด์อโลน"
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 510bf75b8e52
---

# Markdown to HTML {#markdown-to-html}

แปลงไฟล์ Markdown เป็นหน้า HTML แบบสแตนด์อโลน ภาพระยะไกลที่อ้างอิงในต้นฉบับจะถูกคงไว้ตามเดิมในผลลัพธ์

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

รับข้อมูล multipart form ที่มีไฟล์ Markdown

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ Markdown แล้วจะถูกแปลงเป็น HTML

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รับได้: `.md`, `.markdown`
- นี่คือเครื่องมือแบบเร็ว (ซิงโครนัส) ที่ส่งคืนผลลัพธ์โดยตรง
- ผลลัพธ์เป็นหน้า HTML แบบสมบูรณ์ในตัวพร้อมสไตล์อินไลน์
- URL ของภาพระยะไกลในต้นฉบับ Markdown จะถูกคงไว้ตามเดิมและไม่ถูกดึงมา
