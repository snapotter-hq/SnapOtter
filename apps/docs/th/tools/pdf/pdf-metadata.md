---
description: "อ่านและเขียนข้อมูลเมทาดาทาของเอกสาร PDF"
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 47136ab79373
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

อ่านและอัปเดตฟิลด์เมทาดาทาของเอกสาร PDF เช่น ชื่อเรื่อง ผู้เขียน หัวเรื่อง และคำสำคัญ หรือลบเมทาดาทาของเอกสารออกทั้งหมด เมื่อไม่ได้ระบุการตั้งค่า ระบบจะคืนเมทาดาทาที่มีอยู่โดยไม่แก้ไข

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
| stripAll | boolean | No | false | ลบ Info dictionary ทั้งหมด (วันที่ Creator Producer และคีย์กำหนดเอง) สตรีม XMP ทุกสตรีม (เอกสาร หน้า รูปภาพ) และข้อมูลแอปพลิเคชัน PieceInfo ทั้งหมด แล้วจึงเขียนฟิลด์ที่ระบุไว้ข้างต้น |
| removeAttachments | boolean | No | false | ลบไฟล์ที่ฝังไว้ด้วย ได้แก่ รายการไฟล์แนบของเอกสาร annotation ไฟล์แนบ และ associated files (`/AF`) ต้องใช้ร่วมกับ `stripAll` |

พารามิเตอร์ทั้งหมดไม่บังคับ ฟิลด์ที่ละเว้นจะคงเดิมไม่เปลี่ยนแปลง เว้นแต่ตั้งค่า `stripAll`

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
- เมื่อใช้ `stripAll` การตอบกลับจะมี `stripped` ด้วย ซึ่งระบุคีย์ Info ที่ถูกลบ (`removed`) สตรีม XMP ของเอกสารถูกลบหรือไม่ (`xmpRemoved`) ระดับ PDF/A ที่อินพุตประกาศไว้ (`pdfa` หรือ `null`) จำนวนสตรีม XMP ที่ถูกลบออกจากหน้า รูปภาพ และออบเจกต์อื่น (`objectXmpRemoved`) จำนวน PieceInfo dictionary ที่ถูกลบ (`pieceInfoRemoved`) และจำนวนไฟล์ฝังที่ถูกลบ (`attachmentsRemoved` ซึ่งเป็น `0` เสมอหากไม่มี `removeAttachments`) การลบ XMP จะทำให้ไม่สอดคล้องกับ PDF/A
- `stripAll` เพียงอย่างเดียวจะคงไฟล์แนบที่ฝังไว้ เพราะการลบไฟล์เหล่านั้นเปลี่ยนเนื้อหาของเอกสาร เพิ่ม `removeAttachments` เพื่อลบไฟล์แนบด้วย ซึ่งจะลบ XML ที่แนบอยู่ใน e-invoice แบบ ZUGFeRD และ Factur-X และทำให้ไม่สอดคล้องกับ PDF/A-3
- การส่ง `removeAttachments` โดยไม่มี `stripAll` จะตอบ 400
