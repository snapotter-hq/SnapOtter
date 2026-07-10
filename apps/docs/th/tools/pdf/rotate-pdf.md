---
description: "หมุนหน้าใน PDF ไป 90, 180 หรือ 270 องศา"
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: ca7e9e0cde07
---

# Rotate PDF {#rotate-pdf}

หมุนทุกหน้าหรือหน้าที่เลือกใน PDF ไปตามมุมที่ระบุ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | มุมการหมุน: `90`, `180` หรือ `270` |
| range | string | No | `"1-z"` | ช่วงหน้าตามไวยากรณ์ qpdf เช่น `"1-5,8"` (`"1-z"` = ทุกหน้า) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
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

- การหมุนเป็นแบบตามเข็มนาฬิกา
- ช่วงหน้าใช้ไวยากรณ์ qpdf: `1-5` สำหรับหน้า 1 ถึง 5, `z` สำหรับหน้าสุดท้าย และใช้จุลภาคเพื่อรวมช่วงต่าง ๆ
- ช่วงเริ่มต้น `"1-z"` จะหมุนทุกหน้า
