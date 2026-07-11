---
description: "อ่านและเขียนข้อมูลเมทาดาทาของเอกสาร PDF"
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 40a82be7c020
---

# PDF Metadata {#pdf-metadata}

อ่านและอัปเดตฟิลด์เมทาดาทาของเอกสาร PDF เช่น ชื่อเรื่อง ผู้เขียน หัวเรื่อง และคำสำคัญ เมื่อไม่ได้ระบุการตั้งค่า ระบบจะคืนเมทาดาทาที่มีอยู่โดยไม่แก้ไข

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | ชื่อเรื่องเอกสาร (สูงสุด 500 อักขระ) |
| author | string | No | - | ผู้เขียนเอกสาร (สูงสุด 500 อักขระ) |
| subject | string | No | - | หัวเรื่องเอกสาร (สูงสุด 500 อักขระ) |
| keywords | string | No | - | คำสำคัญของเอกสาร (สูงสุด 500 อักขระ) |

พารามิเตอร์ทั้งหมดไม่บังคับ ฟิลด์ที่ละเว้นจะคงเดิมไม่เปลี่ยนแปลง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- นี่เป็นเครื่องมือแบบเร็ว (ซิงโครนัส) ที่คืนผลลัพธ์โดยตรง
- ฟิลด์ `metadata` ในการตอบกลับจะมีเมทาดาทาที่ได้หลังจากอัปเดตใด ๆ
- หากต้องการอ่านเมทาดาทาโดยไม่แก้ไข ให้ละเว้นฟิลด์ `settings` หรือส่งอ็อบเจกต์ว่าง
- แต่ละฟิลด์เมทาดาทาจำกัดไว้ที่ 500 อักขระ
