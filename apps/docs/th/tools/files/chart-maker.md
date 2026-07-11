---
description: "สร้างแผนภูมิแท่ง เส้น หรือวงกลมจากข้อมูล CSV หรือ JSON"
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: aa46178c8d3e
---

# Chart Maker {#chart-maker}

สร้างแผนภูมิแท่ง เส้น หรือวงกลมจากข้อมูล CSV หรือ JSON ส่งคืนภาพ PNG ของแผนภูมิที่เรนเดอร์แล้ว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

รับข้อมูล multipart form ที่มีไฟล์ CSV หรือ JSON และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| kind | string | No | `"bar"` | ประเภทแผนภูมิ: `bar`, `line`, `pie` |
| title | string | No | - | ชื่อแผนภูมิ (สูงสุด 120 อักขระ) |
| width | integer | No | `960` | ความกว้างแผนภูมิเป็นพิกเซล (320-2048) |
| height | integer | No | `540` | ความสูงแผนภูมิเป็นพิกเซล (240-1536) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notes {#notes}

- อินพุตต้องเป็นไฟล์ `.csv` หรือ `.json` ไฟล์ CSV ควรมีแถวส่วนหัวพร้อมชื่อคอลัมน์
- คอลัมน์แรกใช้เป็นป้ายกำกับหมวดหมู่ คอลัมน์ที่สองต้องเป็นตัวเลขและให้ค่าข้อมูล ใช้เพียงสองคอลัมน์เท่านั้น
- อินพุต JSON ควรเป็นอาร์เรย์ของออบเจกต์ `{label, value}` หรือออบเจกต์ธรรมดาที่คีย์กลายเป็นป้ายกำกับและค่ากลายเป็นจุดข้อมูล
- จุดข้อมูลสูงสุด 100 จุด ค่าทั้งหมดต้องเป็นศูนย์หรือมากกว่า
- ผลลัพธ์จะเป็นภาพ PNG เสมอ ไม่ว่ารูปแบบอินพุตจะเป็นอะไร
