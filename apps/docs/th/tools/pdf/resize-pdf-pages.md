---
description: "ปรับขนาดทุกหน้าของ PDF เป็น A4, Letter, ป้ายจัดส่งขนาด 4x6 นิ้ว หรือขนาดที่กำหนดเอง"
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: c1708b76b350
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

เปลี่ยนขนาดหน้าของทุกหน้าใน PDF เนื้อหาจะถูกปรับสัดส่วนให้พอดีกับหน้าใหม่และจัดกึ่งกลาง ข้อความ งานเวกเตอร์ และบาร์โค้ดจึงยังคมชัด ใช้เปลี่ยนป้ายจัดส่งเป็นหน้าขนาด 4x6 นิ้วสำหรับเครื่องพิมพ์ความร้อน หรือย้ายเอกสารระหว่าง A4 กับ US Letter

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

รับข้อมูล multipart form ที่มีไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | ขนาดเป้าหมาย: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal`, หรือ `custom` |
| width | number | No | `4` | ความกว้างหน้ากำหนดเอง ใช้เมื่อ `pageSize` เป็น `custom` |
| height | number | No | `6` | ความสูงหน้ากำหนดเอง ใช้เมื่อ `pageSize` เป็น `custom` |
| unit | string | No | `"in"` | หน่วยของขนาดกำหนดเอง: `in` หรือ `mm` |
| keepOrientation | boolean | No | `false` | หมุนขนาดเป้าหมายให้ตรงกับการวางแนวของแต่ละหน้า แทนที่จะบังคับเป็นกว้างคูณสูง |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- หน้าจะถูกปรับสัดส่วนให้พอดี ไม่ถูกยืด เมื่ออัตราส่วนภาพต่างกัน พื้นที่ที่เหลือจะถูกเว้นว่าง
- การปรับขนาดไม่ครอปภาพ ป้ายที่พิมพ์อยู่ในหนึ่งในสี่ของหน้า Letter หรือ A4 จะยังกินพื้นที่แค่หนึ่งในสี่ของหน้าใหม่
- ขนาดกำหนดเองต้องอยู่ที่ 0.5-200 นิ้ว (12.7-5080 มม.) ในแต่ละด้าน
- หน้าจะถูกปรับขนาดจากกล่องครอปของหน้านั้นหากมี ดังนั้นหน้าที่ถูกครอปไว้จะเหลือเฉพาะส่วนที่ครอป
