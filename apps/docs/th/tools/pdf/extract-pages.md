---
description: "ดึงหน้าที่เลือกจาก PDF ออกมาเป็นเอกสารใหม่"
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: 5ae48ad821df
---

# Extract Pages {#extract-pages}

ดึงหน้าที่เลือกจาก PDF ออกมาเป็นเอกสารใหม่ที่เล็กลง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | ช่วงหน้าตามไวยากรณ์ qpdf เช่น `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- ช่วงหน้าใช้ไวยากรณ์ qpdf: `1-5` สำหรับหน้า 1 ถึง 5, `z` สำหรับหน้าสุดท้าย และใช้จุลภาคเพื่อรวมช่วงต่าง ๆ (เช่น `1-3,7,10-z`)
- หน้าที่ดึงออกมาจะคงรูปแบบ คำอธิบายประกอบ และลิงก์เดิมไว้
