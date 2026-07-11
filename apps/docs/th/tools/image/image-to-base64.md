---
description: "แปลงภาพเป็น base64 data URI เพื่อฝังใน HTML, CSS และอื่นๆ"
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 639591f76c1a
---

# Image to Base64 {#image-to-base64}

แปลงภาพหนึ่งภาพหรือมากกว่าเป็นสตริงที่เข้ารหัส base64 และ data URI รองรับการแปลงรูปแบบ การควบคุมคุณภาพ และการปรับขนาดที่เป็นทางเลือก มีประโยชน์สำหรับการฝังภาพโดยตรงใน HTML, CSS, JSON หรือเทมเพลตอีเมล

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพหนึ่งไฟล์หรือมากกว่า และฟิลด์ JSON `settings` ที่เป็นทางเลือก

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"original"` | แปลงก่อนการเข้ารหัส: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | No | `80` | คุณภาพผลลัพธ์สำหรับรูปแบบ lossy (1 ถึง 100) |
| maxWidth | number | No | `0` | ความกว้างสูงสุดเป็นพิกเซล (0 = ไม่ปรับขนาด จะไม่ขยาย) |
| maxHeight | number | No | `0` | ความสูงสูงสุดเป็นพิกเซล (0 = ไม่ปรับขนาด จะไม่ขยาย) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

หลายไฟล์:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Example Response {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| results | array | ภาพที่แปลงสำเร็จ |
| errors | array | ภาพที่ประมวลผลล้มเหลว (พร้อมชื่อไฟล์และข้อความแสดงข้อผิดพลาด) |

### Result Object {#result-object}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | ชื่อไฟล์เดิม |
| mimeType | string | MIME type ของผลลัพธ์ที่เข้ารหัส |
| width | number | ความกว้างสุดท้ายเป็นพิกเซล (หลังจากการปรับขนาด) |
| height | number | ความสูงสุดท้ายเป็นพิกเซล (หลังจากการปรับขนาด) |
| originalSize | number | ขนาดไฟล์เดิมเป็นไบต์ |
| encodedSize | number | ขนาดของสตริง base64 เป็นไบต์ |
| overheadPercent | number | เปอร์เซ็นต์ความแตกต่างของขนาดเทียบกับต้นฉบับ (บวก = ใหญ่ขึ้น, ลบ = เล็กลง) |
| base64 | string | ข้อมูลภาพที่เข้ารหัส base64 ดิบ |
| dataUri | string | data URI ที่สมบูรณ์พร้อมใช้งานในแอตทริบิวต์ `src` |

## Notes {#notes}

- การเข้ารหัส base64 มักเพิ่มขนาดประมาณ 33% เมื่อเทียบกับไฟล์ไบนารี ฟิลด์ `overheadPercent` แสดงความแตกต่างที่แท้จริง
- เมื่อ `outputFormat` เป็น `"original"` ไฟล์ HEIC/HEIF จะถูกแปลงเป็น JPEG (เนื่องจากเบราว์เซอร์ไม่สามารถแสดง HEIC ใน data URI ได้)
- ตัวเลือก `maxWidth` และ `maxHeight` ปรับขนาดโดยใช้ `fit: inside` ร่วมกับ `withoutEnlargement` ดังนั้นภาพที่เล็กกว่าขนาดที่ระบุจะไม่ถูกขยาย
- สามารถประมวลผลหลายไฟล์ในคำขอเดียว แต่ละไฟล์ถูกประมวลผลแยกกัน และความล้มเหลวไม่ทำให้ไฟล์อื่นๆ ล้มเหลว
- ไฟล์ SVG จะถูกส่งผ่านเป็น `image/svg+xml` โดยไม่มีการเข้ารหัสซ้ำ (เว้นแต่มีการร้องขอการแปลงรูปแบบ)
- นี่คือ endpoint แบบอ่านอย่างเดียว ไม่ผลิตไฟล์ที่ดาวน์โหลดได้หรือ `jobId` ข้อมูล base64 จะถูกคืนค่าโดยตรงในเนื้อหาการตอบกลับ
