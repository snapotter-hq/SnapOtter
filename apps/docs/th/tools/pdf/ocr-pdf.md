---
description: "ดึงข้อความจากเอกสาร PDF โดยใช้ OCR ที่ขับเคลื่อนด้วย AI"
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 9d356e97ca1f
---

# PDF OCR {#pdf-ocr}

ดึงข้อความจากเอกสาร PDF โดยใช้การรู้จำอักขระด้วยแสง (OCR) ที่ขับเคลื่อนด้วย AI รองรับหลายระดับคุณภาพและหลายภาษา ต้องติดตั้งชุดฟีเจอร์ OCR

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | ระดับคุณภาพ OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | ภาษาของเอกสาร: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | การเลือกหน้า เช่น `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

คืนค่า `202 Accepted` ติดตามความคืบหน้าผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รองรับ: `.pdf`
- นี่เป็นเครื่องมือ AI ที่ต้องติดตั้ง **ชุดฟีเจอร์ OCR** หากยังไม่ได้ติดตั้งชุดฟีเจอร์ API จะคืนค่า `501 Not Implemented`
- ระดับคุณภาพ `fast` ใช้โมเดลที่เบากว่าเพื่อการประมวลผลที่เร็วขึ้น ส่วน `best` ใช้โมเดลที่แม่นยำกว่าโดยแลกกับความเร็ว
- การตั้งค่าภาษา `auto` จะพยายามตรวจจับภาษาของเอกสารโดยอัตโนมัติ
- คุณสามารถเจาะจงหน้าเฉพาะได้โดยใช้ช่วง (`"1-3"`), รายการคั่นด้วยจุลภาค (`"1,3,5"`) หรือ `"all"` สำหรับทุกหน้า
- สำหรับ PDF ที่มีข้อความที่เลือกได้อยู่แล้ว ให้พิจารณาใช้เครื่องมือ [PDF to Text](./pdf-to-text) ที่เร็วกว่าแทน
