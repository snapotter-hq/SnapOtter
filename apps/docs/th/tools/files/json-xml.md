---
description: "แปลงระหว่าง JSON และ XML ทั้งสองทิศทาง"
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 94ec70ff1201
---

# JSON to XML {#json-to-xml}

แปลงระหว่างรูปแบบ JSON และ XML ทั้งสองทิศทาง อัปโหลดไฟล์ JSON เพื่อรับ XML หรืออัปโหลดไฟล์ XML เพื่อรับ JSON

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

รับข้อมูล multipart form ที่มีไฟล์ JSON หรือ XML และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | จัดรูปแบบผลลัพธ์ให้อ่านง่ายพร้อมการเยื้อง |

## Example Request {#example-request}

JSON to XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- ทิศทางการแปลงถูกตรวจจับโดยอัตโนมัติจากนามสกุลไฟล์อินพุต: `.json` ให้ผลเป็น `.xml` และ `.xml` ให้ผลเป็น `.json`
- พารามิเตอร์ `pretty` ใช้กับทั้งสองทิศทาง เมื่อ `false` ผลลัพธ์จะกะทัดรัดโดยไม่มีการเยื้อง
- แอตทริบิวต์ XML และโครงสร้างที่ซ้อนกันจะถูกคงไว้ระหว่างการแปลงไปกลับเมื่อทำได้
