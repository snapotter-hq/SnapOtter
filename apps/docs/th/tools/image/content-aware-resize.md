---
description: "การปรับขนาดแบบ seam-carving ที่เพิ่มหรือลบพิกเซลตามเส้นทางที่มีความสำคัญต่ำ เพื่อรักษาเนื้อหาหลักและใบหน้าเอาไว้"
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 9d94b8142fa0
---

# Content-Aware Resize {#content-aware-resize}

การปรับขนาดแบบ seam carving ที่ลบหรือเพิ่มพิกเซลอย่างชาญฉลาดตามเส้นทางที่มีความสำคัญเชิงสายตาน้อยที่สุด รักษาเนื้อหาสำคัญและปกป้องใบหน้าเป็นทางเลือก

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**การประมวลผล:** แบบซิงโครนัส (ส่งคืนผลลัพธ์โดยตรง)

**ชุดโมเดล:** ไม่จำเป็นสำหรับการทำงานพื้นฐาน การปกป้องใบหน้าใช้ชุด `face-detection` (200-300 MB) หากเปิดใช้งาน

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์ภาพ (multipart) |
| width | number | No | - | ความกว้างเป้าหมายเป็นพิกเซล |
| height | number | No | - | ความสูงเป้าหมายเป็นพิกเซล |
| protectFaces | boolean | No | `false` | ตรวจจับและปกป้องใบหน้าจากการลบ seam |
| blurRadius | number | No | `4` | รัศมีเบลอก่อนประมวลผลสำหรับการคำนวณพลังงาน (0-20) |
| sobelThreshold | number | No | `2` | ค่าเทรชโฮลด์การตรวจจับขอบแบบ Sobel (1-20) ค่าที่สูงกว่าจะทำให้อัลกอริทึมทำงานเชิงรุกมากขึ้น |
| square | boolean | No | `false` | ปรับขนาดให้เป็นสี่เหลี่ยมจัตุรัส (ใช้ด้านที่เล็กกว่า) |

ต้องระบุอย่างน้อยหนึ่งค่าจาก `width`, `height` หรือ `square`

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- เส้นทางแบบกำหนดเองนี้ปัจจุบันส่งคืนการตอบสนอง 200 แบบซิงโครนัส
- ใช้ไลบรารี seam carving `caire` สำหรับการปรับขนาดแบบคำนึงถึงเนื้อหา
- ลดขนาดได้เท่านั้น (ลบ seam) ไม่สามารถขยายภาพเกินขนาดต้นฉบับได้
- ตัวเลือก `protectFaces` ใช้การตรวจจับใบหน้าด้วย AI เพื่อทำเครื่องหมายบริเวณใบหน้าเป็นพลังงานสูง ป้องกันไม่ให้ seam ผ่านใบหน้า
- `blurRadius` ควบคุมการทำให้เรียบก่อนการคำนวณแผนที่พลังงาน ค่าที่สูงกว่าจะทำให้แผนที่พลังงานสม่ำเสมอมากขึ้น ซึ่งช่วยได้กับภาพที่มีสัญญาณรบกวน
- `sobelThreshold` ส่งผลต่อความเชิงรุกในการตรวจจับขอบ ค่าที่ต่ำกว่าจะรักษาขอบที่ละเอียดอ่อนกว่าเอาไว้
- เอาต์พุตเป็นรูปแบบ PNG เสมอ
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
