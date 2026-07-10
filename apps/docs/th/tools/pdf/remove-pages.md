---
description: "ลบหน้าเฉพาะออกจาก PDF"
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 2bec6fc8fbd1
---

# Remove Pages {#remove-pages}

ลบหน้าเฉพาะออกจาก PDF โดยคงหน้าที่เหลือทั้งหมดไว้ครบถ้วน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | ช่วงหน้าที่จะลบตามไวยากรณ์ qpdf เช่น `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- คุณไม่สามารถลบทุกหน้าออกจากเอกสารได้ ต้องเหลืออย่างน้อยหนึ่งหน้า
- ช่วงหน้าใช้ไวยากรณ์ qpdf: `3` สำหรับหน้าเดียว, `5-7` สำหรับช่วง และใช้จุลภาคเพื่อรวม (เช่น `1,3,5-7`)
