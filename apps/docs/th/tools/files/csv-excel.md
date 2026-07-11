---
description: "แปลงระหว่าง CSV และ Excel (XLSX) ทั้งสองทิศทาง"
i18n_source_hash: 213297311e36
i18n_provenance: human
i18n_output_hash: 648347599787
---

# CSV to Excel {#csv-to-excel}

แปลงระหว่างรูปแบบ CSV และ Excel (XLSX) ทั้งสองทิศทาง อัปโหลดไฟล์ CSV หรือ TSV เพื่อรับ XLSX หรืออัปโหลดไฟล์ XLSX เพื่อรับ CSV

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/csv-excel`

รับข้อมูล multipart form ที่มีไฟล์ CSV, TSV หรือ XLSX และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| sheet | integer | No | `1` | หมายเลขเวิร์กชีตที่จะส่งออกเมื่อแปลงจาก XLSX (ต่ำสุด 1) |

## Example Request {#example-request}

CSV to Excel:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.csv" \
  -F 'settings={"sheet": 1}'
```

Excel to CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-excel \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.xlsx" \
  -F 'settings={"sheet": 2}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/data.xlsx",
  "originalSize": 2048,
  "processedSize": 5120
}
```

## Notes {#notes}

- ทิศทางการแปลงถูกตรวจจับโดยอัตโนมัติจากนามสกุลไฟล์อินพุต: `.csv` หรือ `.tsv` ให้ผลเป็น `.xlsx` และ `.xlsx` ให้ผลเป็น `.csv`
- พารามิเตอร์ `sheet` ใช้เฉพาะเมื่อแปลงจาก XLSX เท่านั้น โดยเลือกว่าจะส่งออกเวิร์กชีตใด
- ไฟล์ TSV (ค่าที่คั่นด้วยแท็บ) ได้รับการรองรับควบคู่กับ CSV
