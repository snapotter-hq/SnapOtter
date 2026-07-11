---
description: "รวมไฟล์ CSV หรือ TSV หลายไฟล์ที่มีคอลัมน์ตรงกันเข้าเป็นไฟล์เดียว"
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: 250f984f4740
---

# Merge CSVs {#merge-csvs}

รวมไฟล์ CSV หรือ TSV หลายไฟล์ที่มีคอลัมน์ตรงกันเข้าเป็นไฟล์รวมไฟล์เดียว ไฟล์อินพุตทั้งหมดต้องมีหัวคอลัมน์เหมือนกัน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ CSV สองไฟล์ขึ้นไป ไม่ต้องมีฟิลด์ settings

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ CSV หรือ TSV จำนวน 2-20 ไฟล์ที่มีหัวคอลัมน์ตรงกัน

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Notes {#notes}

- ต้องมีไฟล์อินพุตระหว่าง 2 ถึง 20 ไฟล์
- ไฟล์ทั้งหมดต้องมีหัวคอลัมน์เหมือนกัน การรวมจะล้มเหลวหากคอลัมน์ไม่ตรงกัน
- แถวหัวจะรวมอยู่ในเอาต์พุตเพียงครั้งเดียว แถวข้อมูลจากทุกไฟล์จะถูกต่อกันตามลำดับการอัปโหลด
- รับทั้งไฟล์ CSV และ TSV แต่ไฟล์ทั้งหมดในคำขอเดียวควรใช้ตัวคั่นเดียวกัน
