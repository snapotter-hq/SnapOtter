---
description: "จัดเรียงหน้า PDF สำหรับพับเป็นหนังสือเล่มเล็ก"
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: fab69922eed7
---

# Booklet PDF {#booklet-pdf}

จัดวางหน้าสำหรับการพิมพ์สองหน้า เพื่อให้แผ่นที่พิมพ์สามารถพับเป็นหนังสือเล่มเล็กได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

รับ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | หน้าต่อแผ่น: `2`, `4`, `6` หรือ `8` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- ค่าเริ่มต้น `perSheet: 2` จะวางสองหน้าเรียงข้างกันบนแต่ละแผ่น ซึ่งเป็นเลย์เอาต์หนังสือเล่มเล็กมาตรฐานสำหรับการพิมพ์สองหน้า
- หน้าว่างจะถูกเพิ่มโดยอัตโนมัติหากจำนวนหน้าทั้งหมดไม่เป็นจำนวนเท่าของขนาดแผ่น
- พิมพ์ผลลัพธ์แบบสองหน้าโดยเข้าเล่มขอบสั้น จากนั้นพับและเย็บ
