---
description: "แปลงระหว่างรูปแบบ Excel, OpenDocument และ CSV"
i18n_source_hash: b813b1b06962
i18n_provenance: human
i18n_output_hash: 6a48863db6c5
---

# Convert Spreadsheet {#convert-spreadsheet}

แปลงสเปรดชีตระหว่างรูปแบบ Excel (XLSX), OpenDocument Spreadsheet (ODS) และ CSV เวิร์กบุ๊กหลายชีตจะส่งออกชีตแรกเมื่อแปลงเป็น CSV

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-spreadsheet`

รับข้อมูล multipart form ที่มีไฟล์ Excel/ODS/CSV และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | รูปแบบผลลัพธ์: `xlsx`, `ods`, `csv` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-spreadsheet \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@data.xlsx" \
  -F 'settings={"format": "csv"}'
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

- รูปแบบอินพุตที่รับได้: `.xlsx`, `.xls`, `.ods`, `.csv`
- เมื่อแปลงเวิร์กบุ๊กหลายชีตเป็น CSV จะส่งออกเฉพาะชีตแรกเท่านั้น
- สูตรจะถูกประเมินผลและส่งออกเป็นค่าคงที่ในผลลัพธ์ CSV
- รูปแบบผลลัพธ์ต้องแตกต่างจากรูปแบบอินพุต
