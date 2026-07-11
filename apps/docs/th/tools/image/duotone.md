---
description: "ใช้เอฟเฟกต์ duotone สองสีด้วยสีเงาและสีไฮไลต์ที่กำหนดเอง"
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: c02871d7b211
---

# Duotone {#duotone}

ใช้เอฟเฟกต์ duotone สองสีกับภาพ ภาพจะถูกแปลงเป็นโทนสีเทา แล้วแมปกับการไล่สีระหว่างสีเงา (โทนเข้ม) กับสีไฮไลต์ (โทนสว่าง)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | สี hex ของเงา (ใช้กับโทนเข้ม) |
| highlight | string | No | `"#fbbf24"` | สี hex ของไฮไลต์ (ใช้กับโทนสว่าง) |
| intensity | integer | No | `100` | ความเข้มของเอฟเฟกต์ (0-100); 0 จะคืนภาพต้นฉบับ, 100 จะใช้ duotone เต็มรูปแบบ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes {#notes}

- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนประมวลผล
- ค่า `intensity` ที่น้อยกว่า 100 จะผสมผลลัพธ์ duotone กับภาพต้นฉบับ ทำให้ได้เอฟเฟกต์ที่นุ่มนวลกว่า
- การจับคู่ duotone ที่นิยม ได้แก่ กรมท่า/ทอง, เทาน้ำเงิน/ปะการัง และม่วง/ชมพู
