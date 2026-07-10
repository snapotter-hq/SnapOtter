---
description: "ดึงหน้าออกมาหรือแยก PDF เป็นส่วน ๆ"
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 7b66e9d389a6
---

# Split PDF {#split-pdf}

ดึงช่วงหน้าออกมาเป็น PDF ใหม่ หรือแยกเอกสารเป็นกลุ่มละ N หน้า

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | โหมดการแยก: `range` หรือ `every` |
| range | string | เมื่อ mode เป็น `range` | - | ช่วงหน้าตามไวยากรณ์ qpdf เช่น `"1-5,8,10-z"` |
| everyN | integer | เมื่อ mode เป็น `every` | - | แยกเป็นกลุ่มละ N หน้า (1-500) |

## Example Request {#example-request}

ดึงหน้าเฉพาะ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

แยกเป็นกลุ่มละ 10 หน้า:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- ในโหมด `range` จะคืน PDF ไฟล์เดียวที่มีหน้าที่เลือกไว้
- ในโหมด `every` ผลลัพธ์จะเป็นไฟล์เก็บถาวร ZIP ที่มีแต่ละส่วนแยกกัน
- ช่วงหน้าใช้ไวยากรณ์ qpdf: `1-5` สำหรับหน้า 1 ถึง 5, `z` สำหรับหน้าสุดท้าย และใช้จุลภาคเพื่อรวมช่วงต่าง ๆ (เช่น `1-3,7,10-z`)
