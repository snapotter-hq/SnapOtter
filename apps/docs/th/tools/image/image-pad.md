---
description: "เพิ่มระยะขอบให้ภาพเป็นสัดส่วนภาพเป้าหมายด้วยพื้นหลังสีทึบ โปร่งใส หรือเบลอ"
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 794907dc8cf6
---

# Image Pad {#image-pad}

เพิ่มระยะขอบให้ภาพเป็นสัดส่วนภาพเป้าหมายโดยเพิ่มพื้นหลังสีทึบ โปร่งใส หรือเบลอรอบภาพ มีประโยชน์สำหรับการปรับภาพให้พอดีกับสัดส่วนภาพคงที่สำหรับโซเชียลมีเดียหรืองานพิมพ์โดยไม่ต้องครอบตัด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

รับข้อมูลแบบ multipart form data ที่มีไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"1:1"` | สัดส่วนภาพเป้าหมาย: `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, หรือ `custom` |
| ratioW | integer | No | `1` | ความกว้างสัดส่วนแบบกำหนดเอง (1-100 ใช้เมื่อ target เป็น `custom`) |
| ratioH | integer | No | `1` | ความสูงสัดส่วนแบบกำหนดเอง (1-100 ใช้เมื่อ target เป็น `custom`) |
| background | string | No | `"color"` | โหมดพื้นหลัง: `color`, `transparent`, หรือ `blur` |
| color | string | No | `"#ffffff"` | สีพื้นหลังแบบ hex (เมื่อ background เป็น `color`) |
| padding | integer | No | `0` | ระยะขอบเพิ่มเติมเป็นเปอร์เซ็นต์ของ canvas (0-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notes {#notes}

- โหมดพื้นหลัง `blur` สร้างสำเนาที่เบลอของภาพต้นฉบับเป็นการเติมระยะขอบ ทำให้ได้ผลลัพธ์ที่กลมกลืนทางสายตา
- เมื่อใช้พื้นหลัง `transparent` ผลลัพธ์จะถูกแปลงเป็น PNG เพื่อรักษา alpha
- รูปแบบผลลัพธ์ตรงกับรูปแบบนำเข้า เว้นแต่จะเกี่ยวข้องกับความโปร่งใส อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสโดยอัตโนมัติก่อนการประมวลผล
- ตั้งค่า `target` เป็น `custom` และระบุ `ratioW` และ `ratioH` สำหรับสัดส่วนภาพใดๆ ก็ได้ (เช่น `ratioW: 3, ratioH: 2` สำหรับ 3:2)
