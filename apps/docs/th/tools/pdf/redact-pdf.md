---
description: "ลบข้อความที่พบใน PDF อย่างถาวร (การลบข้อมูลจริงที่ตรวจสอบได้)"
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 40bf7d3853af
---

# Redact PDF {#redact-pdf}

ลบข้อความที่ระบุออกจาก PDF อย่างถาวรโดยใช้การลบข้อมูลจริงที่ตรวจสอบได้ ข้อความที่ลบจะถูกนำออกจากไฟล์อย่างสมบูรณ์ ไม่ใช่แค่ปิดทับด้วยกล่องสีดำ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| terms | string[] | Yes | - | สตริงข้อความที่จะลบ (1-50 รายการ แต่ละรายการสูงสุด 200 อักขระ) |
| caseSensitive | boolean | No | `false` | การจับคู่คำนึงถึงตัวพิมพ์ใหญ่-เล็กหรือไม่ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- นี่เป็นเครื่องมือแบบเร็ว (ซิงโครนัส) ที่คืนผลลัพธ์โดยตรง
- นี่คือการลบข้อมูลจริง: ข้อความที่ตรงกันจะถูกนำออกจากสตรีมเนื้อหา PDF ไม่ใช่แค่ปิดบังทางสายตาเท่านั้น
- ฟิลด์ `found` ในการตอบกลับจะระบุว่ามีข้อความกี่รายการที่ถูกลบ
- คุณสามารถลบข้อความได้สูงสุด 50 รายการในคำขอเดียว
