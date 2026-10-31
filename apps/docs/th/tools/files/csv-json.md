---
description: "แปลงระหว่าง CSV และ JSON ทั้งสองทิศทาง"
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: 740a034837d5
---

# CSV to JSON {#csv-to-json}

แปลงระหว่างรูปแบบ CSV และ JSON ทั้งสองทิศทาง อัปโหลดไฟล์ CSV หรือ TSV เพื่อรับอาร์เรย์ JSON ของออบเจกต์ หรืออัปโหลด JSON (อาร์เรย์ของออบเจกต์ หรือออบเจกต์ที่ห่ออาร์เรย์นั้นไว้) เพื่อรับไฟล์ CSV

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

รับข้อมูล multipart form ที่มีไฟล์ CSV, TSV หรือ JSON และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | จัดรูปแบบผลลัพธ์ JSON ให้อ่านง่ายพร้อมการเยื้อง |

## Example Request {#example-request}

CSV to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notes {#notes}

- ทิศทางการแปลงถูกตรวจจับโดยอัตโนมัติจากนามสกุลไฟล์อินพุต: `.csv` หรือ `.tsv` ให้ผลเป็น `.json` และ `.json` ให้ผลเป็น `.csv`
- พารามิเตอร์ `pretty` ส่งผลต่อผลลัพธ์ JSON เท่านั้น เมื่อตั้งค่าเป็น `false` ผลลัพธ์จะเป็นสตริง JSON บรรทัดเดียวแบบกะทัดรัด
- อินพุต JSON เป็นได้ทั้งอาร์เรย์ของออบเจกต์ ออบเจกต์ที่มีคีย์เดียวซึ่งเก็บอาร์เรย์ดังกล่าว (เช่น `{"data": [...]}`) หรือออบเจกต์แบบแบนที่มีแต่ค่าสเกลาร์ แต่ละออบเจกต์กลายเป็นหนึ่งแถว และแต่ละคีย์กลายเป็นส่วนหัวคอลัมน์ ออบเจกต์แบบแบนจะได้เป็นตารางสองคอลัมน์ `key,value` ออบเจกต์ที่มีหลายคีย์ระดับบนสุดและอาร์เรย์ว่างจะถูกปฏิเสธ
- ไฟล์ TSV (ค่าที่คั่นด้วยแท็บ) ได้รับการรองรับควบคู่กับ CSV
