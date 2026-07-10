---
description: "ตรวจหาภาพซ้ำและภาพที่เกือบซ้ำโดยใช้ perceptual hashing"
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 938d30529627
---

# Find Duplicates {#find-duplicates}

อัปโหลดภาพหลายภาพเพื่อตรวจหาภาพซ้ำและภาพที่เกือบซ้ำโดยใช้ perceptual hashing (dHash) จัดกลุ่มภาพที่คล้ายกันเข้าด้วยกัน ระบุเวอร์ชันที่มีคุณภาพดีที่สุดในแต่ละกลุ่ม และคำนวณพื้นที่ที่อาจประหยัดได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพหลายไฟล์ และฟิลด์ JSON `settings` ที่เป็นทางเลือก

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| threshold | number | No | `8` | ระยะ Hamming distance สูงสุดที่จะถือว่าภาพเป็นภาพซ้ำ (0 ถึง 20) ยิ่งต่ำ = การจับคู่ยิ่งเข้มงวด |

### File Fields {#file-fields}

อัปโหลดไฟล์ภาพอย่างน้อย 2 ไฟล์ในคำขอ multipart (ทั้งหมดใช้ชื่อฟิลด์ `file` หรือชื่อฟิลด์ใดก็ได้สำหรับส่วนที่เป็นไฟล์)

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Example Response {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| totalImages | number | จำนวนภาพที่วิเคราะห์สำเร็จ |
| duplicateGroups | array | กลุ่มของภาพซ้ำ |
| uniqueImages | number | จำนวนภาพที่ไม่ได้อยู่ในกลุ่มภาพซ้ำใดๆ |
| spaceSaveable | number | จำนวนไบต์ทั้งหมดที่ประหยัดได้จากการลบภาพซ้ำที่ไม่ใช่ภาพที่ดีที่สุด |
| skippedFiles | array | ไฟล์ที่ประมวลผลไม่ได้ (พร้อมชื่อไฟล์และเหตุผล) |

### Duplicate Group Object {#duplicate-group-object}

| Field | Type | Description |
|-------|------|-------------|
| groupId | number | ตัวระบุกลุ่ม |
| files | array | ภาพในกลุ่มภาพซ้ำนี้ |

### File Object (within a group) {#file-object-within-a-group}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | ชื่อไฟล์เดิม |
| similarity | number | เปอร์เซ็นต์ความคล้ายกับภาพอ้างอิง (ภาพแรกในกลุ่ม) |
| width | number | ความกว้างของภาพเป็นพิกเซล |
| height | number | ความสูงของภาพเป็นพิกเซล |
| fileSize | number | ขนาดไฟล์เป็นไบต์ |
| format | string | รูปแบบของภาพ |
| isBest | boolean | ว่าเป็นเวอร์ชันคุณภาพสูงสุดหรือไม่ (พิกเซลมากที่สุด ไฟล์ใหญ่ที่สุด) |
| thumbnail | string or null | ภาพขนาดย่อ Base64 JPEG (กว้าง 200px) สำหรับดูตัวอย่าง |

## Notes {#notes}

- ใช้ dHash แบบ 128 บิต (แถว 64 บิต + คอลัมน์ 64 บิต) เพื่อตรวจจับความคล้ายเชิงการรับรู้ ซึ่งจับภาพซ้ำได้แม้ผ่านการปรับขนาด การบีบอัดซ้ำ และการแก้ไขเล็กน้อย
- threshold แทนระยะ Hamming distance สูงสุดระหว่าง hash ค่าเริ่มต้นที่ 8 จับภาพที่เกือบซ้ำได้ในขณะที่หลีกเลี่ยง false positive ใช้ 0 สำหรับภาพที่เหมือนกันในระดับพิกเซลเท่านั้น หรือ 15-20 สำหรับการจับคู่ที่หลวมมาก
- ภาพ "ที่ดีที่สุด" ในแต่ละกลุ่มคือภาพที่มีพิกเซลมากที่สุด (width x height) โดยใช้ขนาดไฟล์เป็นตัวตัดสินเสมอ
- ต้องมีภาพอย่างน้อย 2 ภาพ ไฟล์ที่ไม่ผ่านการตรวจสอบหรือถอดรหัสไม่ได้จะถูกรายงานใน `skippedFiles` แทนที่จะทำให้คำขอทั้งหมดล้มเหลว
- ภาพขนาดย่อเป็นภาพตัวอย่าง JPEG กว้าง 200px ที่เข้ารหัสเป็น data URI
- รองรับรูปแบบทั่วไปทั้งหมด (HEIC, RAW, PSD, SVG ถอดรหัสโดยอัตโนมัติ)
