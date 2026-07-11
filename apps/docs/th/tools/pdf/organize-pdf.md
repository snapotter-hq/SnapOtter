---
description: "จัดเรียงลำดับหน้าใน PDF ด้วยลำดับหน้าที่ระบุชัดเจน"
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: edbc73ec05f3
---

# Organize PDF {#organize-pdf}

จัดเรียงลำดับหน้าใน PDF โดยระบุลำดับหน้าที่ต้องการ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | ลำดับหน้าที่ต้องการตามไวยากรณ์ qpdf เช่น `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- ช่วงหน้าใช้ไวยากรณ์ qpdf: `3,1,2` จัดเรียงสามหน้าแรกใหม่ และ `5-z` ต่อท้ายหน้า 5 ไปจนถึงหน้าสุดท้าย
- สามารถทำหน้าซ้ำได้โดยระบุมากกว่าหนึ่งครั้ง (เช่น `"1,1,2,3"` ทำหน้า 1 ซ้ำ)
- หน้าที่ไม่ได้ระบุในสตริงลำดับจะถูกละเว้นจากผลลัพธ์
