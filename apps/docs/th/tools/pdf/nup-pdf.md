---
description: "จัดหน้า PDF หลายหน้าต่อแผ่น (2-up, 4-up และอื่น ๆ)"
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: 42ffd479de9c
---

# N-up PDF {#n-up-pdf}

จัดหลายหน้าต่อแผ่นเพื่อประหยัดกระดาษเมื่อพิมพ์ เช่น เค้าโครง 2-up หรือ 4-up

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | หน้าต่อแผ่น: `2`, `3`, `4`, `8`, `9`, `12` หรือ `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- หน้าจะถูกจัดเรียงตามลำดับการอ่าน (ซ้ายไปขวา บนลงล่าง)
- ขนาดหน้าผลลัพธ์จะตรงกับต้นฉบับ แต่ละหน้าจะถูกย่อลงเพื่อให้พอดีกับกริด
- เอกสาร 20 หน้าที่ใช้ `perSheet: 4` จะให้ผลลัพธ์ 5 หน้า
