---
description: "แปลงระหว่าง YAML และ JSON ได้ทั้งสองทิศทาง"
i18n_source_hash: ef0c9b633797
i18n_provenance: human
i18n_output_hash: b6ca87b1b8e1
---

# แปลง YAML / JSON {#yaml-json}

แปลงระหว่างรูปแบบ YAML และ JSON ได้ทั้งสองทิศทาง อัปโหลดไฟล์ YAML เพื่อรับ JSON หรืออัปโหลดไฟล์ JSON เพื่อรับ YAML

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ YAML หรือ JSON ไม่ต้องมีฟิลด์ settings

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ ทิศทางการแปลงกำหนดจากนามสกุลไฟล์อินพุต

## Example Request {#example-request}

YAML เป็น JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON เป็น YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- ทิศทางการแปลงตรวจจับอัตโนมัติจากนามสกุลไฟล์อินพุต: `.yaml` หรือ `.yml` ผลิต `.json` และ `.json` ผลิต `.yaml`
- รับทั้งนามสกุล `.yaml` และ `.yml`
- แปลงเฉพาะเอกสารแรกในไฟล์ YAML แบบหลายเอกสารเท่านั้น เอกสารเพิ่มเติมที่คั่นด้วย `---` จะถูกละเว้น
