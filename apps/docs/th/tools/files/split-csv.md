---
description: "แบ่ง CSV เป็นไฟล์ย่อยตามจำนวนแถว"
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 0eaf6240631d
---

# Split CSV {#split-csv}

แบ่งไฟล์ CSV หรือ TSV ขนาดใหญ่เป็นไฟล์ย่อยตามจำนวนแถว ส่งคืนไฟล์เก็บถาวร ZIP ที่มีชิ้นส่วนต่าง ๆ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ CSV และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | No | `1000` | จำนวนแถวข้อมูลต่อไฟล์เอาต์พุต (1-1,000,000) |
| keepHeader | boolean | No | `true` | ทำซ้ำแถวหัวในแต่ละไฟล์เอาต์พุต |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Notes {#notes}

- เอาต์พุตเป็นไฟล์เก็บถาวร ZIP ที่มีชิ้นส่วน CSV ที่แบ่งแล้วเสมอ ตั้งชื่อตามลำดับ (เช่น `part-1.csv`, `part-2.csv`)
- เมื่อ `keepHeader` เป็น `true` แต่ละชิ้นส่วนจะมีแถวหัวต้นฉบับ เพื่อให้แต่ละไฟล์ใช้งานได้อย่างอิสระ
- รับทั้งไฟล์ CSV และ TSV เป็นอินพุต
- จำนวนแถวหมายถึงแถวข้อมูลเท่านั้น แถวหัวไม่ถูกนับ
