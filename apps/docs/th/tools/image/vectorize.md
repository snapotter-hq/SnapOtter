---
description: "แปลงภาพแรสเตอร์เป็น SVG ด้วยการทำเวกเตอร์แบบขาวดำ (potrace) และแบบหลายเลเยอร์เต็มสี"
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: aaac462449ae
---

# Image to SVG {#image-to-svg}

ทำเวกเตอร์ภาพแรสเตอร์เป็น SVG โดยใช้อัลกอริทึมการเทรซ รองรับการเทรซแบบขาวดำ (potrace) และการทำเวกเตอร์หลายเลเยอร์เต็มสี

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | โหมดการเทรซ: `bw` (ขาวดำ) หรือ `color` (เลเยอร์หลายสี) |
| threshold | number | No | 128 | เกณฑ์ความสว่างสำหรับโหมด B&W (0 ถึง 255) พิกเซลที่ต่ำกว่าจะกลายเป็นสีดำ |
| colorPrecision | number | No | 6 | ความแม่นยำในการควอนไทซ์สีสำหรับโหมดสี (1 ถึง 16) ค่ายิ่งสูงยิ่งสร้างเลเยอร์สีที่แตกต่างมากขึ้น |
| layerDifference | number | No | 6 | ความต่างของสีขั้นต่ำระหว่างเลเยอร์ในโหมดสี (1 ถึง 128) |
| filterSpeckle | number | No | 4 | พื้นที่ขั้นต่ำสำหรับรูปทรงที่เทรซเป็นพิกเซล (1 ถึง 256) ลบสัญญาณรบกวน/จุดเล็กๆ |
| pathMode | string | No | `"spline"` | การทำให้พาธเรียบ: `none` (ขรุขระ), `polygon` (ส่วนเส้นตรง), `spline` (เส้นโค้งเรียบ) |
| cornerThreshold | number | No | 60 | เกณฑ์มุมสำหรับการตรวจจับมุมในโหมดสี (0 ถึง 180 องศา) |
| invert | boolean | No | `false` | กลับสีภาพก่อนเทรซ (สลับดำ/ขาว) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- ผลลัพธ์เป็นไฟล์ SVG เสมอไม่ว่ารูปแบบไฟล์นำเข้าจะเป็นอะไร
- รองรับรูปแบบไฟล์นำเข้า HEIC, RAW, PSD และ SVG (ถอดรหัสเป็นแรสเตอร์อัตโนมัติก่อนเทรซ)
- โหมด B&W ใช้อัลกอริทึม potrace ภาพจะถูกแปลงเป็นเฉดสีเทาก่อน แล้วปรับตามเกณฑ์เป็นขาวดำล้วนก่อนเทรซ
- โหมดสีใช้วิธีการหลายเลเยอร์: ภาพจะถูกควอนไทซ์เป็นเลเยอร์สี แต่ละเลเยอร์เทรซแยกกันแล้วเรียงซ้อนในผลลัพธ์ SVG
- ค่า `filterSpeckle` ที่ต่ำกว่าจะรักษารายละเอียดมากขึ้นแต่สร้างไฟล์ SVG ที่ใหญ่กว่าและมีพาธมากขึ้น
- การตั้งค่า `pathMode` ส่งผลต่อขนาดไฟล์อย่างมาก: `none` สร้างพาธมากที่สุด ส่วน `spline` ให้ผลลัพธ์ที่เรียบที่สุด (และมักเล็กที่สุด)
- เพื่อผลลัพธ์ที่ดีที่สุดกับโลโก้และไอคอน ใช้โหมด B&W กับภาพนำเข้าที่คมชัดและมีความต่างสูง สำหรับภาพถ่ายหรือภาพประกอบ ใช้โหมดสีด้วยค่า `colorPrecision` ที่สูงขึ้น
