---
description: "แปลง EPUB เป็น PDF, DOCX, HTML หรือ Markdown"
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 46f1d9a0017f
---

# แปลงจาก EPUB {#convert-epub}

แปลงหนังสืออิเล็กทรอนิกส์ EPUB เป็น PDF, Word (DOCX), HTML หรือ Markdown ทรัพยากรระยะไกลภายในหนังสือจะไม่ถูกดึงมา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

รับข้อมูล multipart form ที่มีไฟล์ EPUB และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | รูปแบบผลลัพธ์: `pdf`, `docx`, `html`, `md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- รูปแบบอินพุตที่รับได้: `.epub`
- ทรัพยากรระยะไกลที่ฝังอยู่ใน EPUB (ภาพภายนอก ฟอนต์) จะไม่ถูกดึงมาเพื่อความปลอดภัย
- ความคมชัดของภาพในผลลัพธ์ที่แปลงแล้วอาจแตกต่างกันไปขึ้นอยู่กับโครงสร้างของ EPUB
- การแปลงจัดการโดย Pandoc บนเซิร์ฟเวอร์
