---
description: "สกัดองค์ประกอบที่ซ้ำกันจาก XML เป็นตาราง CSV"
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 8c4c248c36c3
---

# XML to CSV {#xml-to-csv}

สกัดองค์ประกอบที่ซ้ำกันจากไฟล์ XML เป็นตาราง CSV แบบแบน เครื่องมือจะค้นหาอาร์เรย์แรกของอ็อบเจกต์ในโครงสร้างต้นไม้ XML โดยอัตโนมัติ และแมปแต่ละองค์ประกอบเป็นแถว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ XML ไม่ต้องมีฟิลด์ settings

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ องค์ประกอบที่ซ้ำกันจะถูกตรวจจับอัตโนมัติจากโครงสร้าง XML

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Notes {#notes}

- รับเฉพาะไฟล์ `.xml` เป็นอินพุตเท่านั้น
- เครื่องมือจะสแกนโครงสร้างต้นไม้ XML เพื่อหาชุดองค์ประกอบพี่น้องที่ซ้ำกันชุดแรก และใช้ชุดนั้นเป็นแถว
- ชื่อองค์ประกอบลูกหรือแอตทริบิวต์ที่ไม่ซ้ำกันแต่ละชื่อจะกลายเป็นหัวคอลัมน์ CSV
- นี่เป็นการแปลงทางเดียว สำหรับการแปลง JSON/XML แบบสองทาง ให้ใช้เครื่องมือ [JSON to XML](/th/tools/files/json-xml)
