---
description: "เพิ่มขอบ, ระยะขอบ, มุมโค้งมน และเงาทอดให้กับรูปภาพในลำดับที่คาดเดาได้และควบคุมได้"
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: e060adbbef3f
---

# Border & Frame {#border-frame}

เพิ่มขอบ, ระยะขอบ, มุมโค้งมน และเงาทอดให้กับรูปภาพ เครื่องมือจะใช้เอฟเฟกต์ตามลำดับ: ระยะขอบ, ขอบ, รัศมีมุม แล้วจึงเงา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| borderWidth | number | No | 10 | ความหนาของขอบเป็นพิกเซล (0 ถึง 2000) |
| borderColor | string | No | `"#000000"` | สีขอบเป็น hex (เช่น `#FF0000`) |
| padding | number | No | 0 | ระยะขอบด้านในระหว่างรูปภาพกับขอบเป็นพิกเซล (0 ถึง 200) |
| paddingColor | string | No | `"#FFFFFF"` | สีเติมระยะขอบเป็น hex |
| cornerRadius | number | No | 0 | รัศมีมุมเป็นพิกเซล (0 ถึง 2000) |
| shadow | boolean | No | `false` | จะเพิ่มเงาทอดหรือไม่ |
| shadowBlur | number | No | 15 | รัศมีการเบลอเงา (1 ถึง 200) |
| shadowOffsetX | number | No | 0 | ระยะเลื่อนแนวนอนของเงา (-50 ถึง 50) |
| shadowOffsetY | number | No | 5 | ระยะเลื่อนแนวตั้งของเงา (-50 ถึง 50) |
| shadowColor | string | No | `"#000000"` | สีเงาเป็น hex |
| shadowOpacity | number | No | 40 | เปอร์เซ็นต์ความทึบของเงา (0 ถึง 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Notes {#notes}

- ใช้แฟกทอรี `createToolRoute` มาตรฐาน รับไฟล์รูปภาพเดียวผ่านการอัปโหลดแบบ multipart
- รองรับรูปแบบอินพุต HEIC, RAW, PSD และ SVG (ถอดรหัสอัตโนมัติ)
- ลำดับการประมวลผล: เพิ่มระยะขอบก่อน แล้วขอบจะห่อรอบ ๆ จากนั้นใช้รัศมีมุม แล้วจึงประกอบเงา
- เมื่อเปิดใช้งาน `cornerRadius` หรือ `shadow` เอาต์พุตจะถูกบังคับเป็น PNG (ไม่ว่ารูปแบบอินพุตจะเป็นอะไร) เพื่อรักษาความโปร่งใส รูปแบบที่รองรับอัลฟา (PNG, WebP, AVIF) จะคงรูปแบบเดิมไว้
- เงาตระหนักถึงรูปทรง: มันจะติดตามมุมโค้งมนแทนที่จะสร้างเงาสี่เหลี่ยม
- การตั้ง `borderWidth` เป็น 0 และใช้เฉพาะ `cornerRadius` + `shadow` สร้างเอฟเฟกต์เงาโค้งมนแบบไม่มีเฟรม
