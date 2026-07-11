---
description: "แปลงระหว่างรูปแบบงานนำเสนอ PowerPoint และ OpenDocument"
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 9697b0499ef7
---

# Convert Presentation {#convert-presentation}

แปลงงานนำเสนอระหว่างรูปแบบ PowerPoint (PPTX) และ OpenDocument Presentation (ODP)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

รับข้อมูล multipart form ที่มีไฟล์ PowerPoint/ODP และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | รูปแบบผลลัพธ์: `pptx`, `odp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
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

- รูปแบบอินพุตที่รับได้: `.pptx`, `.ppt`, `.odp`
- การแปลงจัดการโดย LibreOffice ที่ทำงานแบบ headless บนเซิร์ฟเวอร์
- แอนิเมชันและเอฟเฟกต์การเปลี่ยนสไลด์อาจไม่คงอยู่ข้ามรูปแบบ
- รูปแบบผลลัพธ์ต้องแตกต่างจากรูปแบบอินพุต
