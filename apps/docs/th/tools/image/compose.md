---
description: "ซ้อนเลเยอร์ภาพด้วยตำแหน่ง ความทึบแสง และโหมดผสมสำหรับการประกอบภาพ"
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 54ebf125ba81
---

# Image Composition {#image-composition}

ซ้อนภาพโอเวอร์เลย์ทับบนภาพพื้นฐานด้วยตำแหน่ง ความทึบแสง และโหมดผสมที่ปรับแต่งได้ มีประโยชน์สำหรับการประกอบโลโก้ กราฟิก หรือการรวมภาพหลายภาพเข้าด้วยกัน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพ **สอง** ไฟล์และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | ระยะออฟเซ็ตแนวนอนของโอเวอร์เลย์จากมุมบนซ้ายเป็นพิกเซล (ต่ำสุด 0) |
| y | number | No | `0` | ระยะออฟเซ็ตแนวตั้งของโอเวอร์เลย์จากมุมบนซ้ายเป็นพิกเซล (ต่ำสุด 0) |
| opacity | number | No | `100` | เปอร์เซ็นต์ความทึบแสงของโอเวอร์เลย์ (0 ถึง 100) |
| blendMode | string | No | `"over"` | โหมดผสมสำหรับการประกอบภาพ |

### Blend Modes {#blend-modes}

| Value | Description |
|-------|-------------|
| `over` | โอเวอร์เลย์แบบปกติ (ค่าเริ่มต้น) |
| `multiply` | ทำให้เข้มขึ้นโดยการคูณค่าพิกเซล |
| `screen` | ทำให้สว่างขึ้นโดยการกลับค่า คูณ แล้วกลับค่าอีกครั้ง |
| `overlay` | รวม multiply และ screen ตามความสว่างของภาพพื้นฐาน |
| `darken` | คงพิกเซลที่เข้มกว่าจากแต่ละเลเยอร์ |
| `lighten` | คงพิกเซลที่สว่างกว่าจากแต่ละเลเยอร์ |
| `hard-light` | โอเวอร์เลย์ที่มีคอนทราสต์สูง |
| `soft-light` | โอเวอร์เลย์ที่มีคอนทราสต์แบบนุ่มนวล |
| `difference` | ความแตกต่างสัมบูรณ์ระหว่างเลเยอร์ |
| `exclusion` | คล้าย difference แต่คอนทราสต์ต่ำกว่า |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | ภาพพื้นฐาน/พื้นหลัง |
| overlay | Yes | ภาพโอเวอร์เลย์/ส่วนหน้า |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

ใช้โหมดผสม multiply:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- ภาพทั้งสองจะถูกตรวจสอบและถอดรหัส (รองรับ HEIC, RAW, PSD, SVG) ก่อนการประกอบภาพ
- โอเวอร์เลย์จะถูกวางที่พิกัดพิกเซลที่ระบุโดย `x` และ `y` อย่างแม่นยำ โดยจะไม่ถูกปรับขนาดให้พอดี
- หากความทึบแสงน้อยกว่า 100 จะมีการนำมาสก์อัลฟามาใช้กับโอเวอร์เลย์ก่อนการผสม
- โอเวอร์เลย์สามารถขยายเกินขอบเขตของภาพพื้นฐานได้ (ส่วนที่เกินจะถูกตัดออก)
- การจัดวางแนว EXIF จะถูกนำมาใช้อัตโนมัติกับภาพทั้งสองก่อนประมวลผล
- ขนาดของเอาต์พุตตรงกับขนาดของภาพพื้นฐาน
