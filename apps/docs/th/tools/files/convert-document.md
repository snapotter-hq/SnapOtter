---
description: "แปลงระหว่างรูปแบบ Word, OpenDocument, RTF และข้อความธรรมดา"
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: e8a7671f10b7
---

# Convert Document {#convert-document}

แปลงเอกสารระหว่างรูปแบบ Word (DOCX), OpenDocument (ODT), RTF และข้อความธรรมดา โดยใช้ LibreOffice

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

รับข้อมูล multipart form ที่มีไฟล์ Word/ODT/RTF/TXT และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | รูปแบบผลลัพธ์: `docx`, `odt`, `rtf`, `txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
```

## Example Response {#example-response}

ส่งคืน `202 Accepted` ติดตามความคืบหน้าผ่าน SSE ที่ `/api/v1/jobs/{jobId}/progress`

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- รูปแบบอินพุตที่รับได้: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
- การจัดรูปแบบที่ซับซ้อน (มาโคร ออบเจกต์ที่ฝัง) อาจไม่คงอยู่ผ่านการแปลงระหว่างรูปแบบ
- รูปแบบผลลัพธ์ต้องแตกต่างจากรูปแบบอินพุต
