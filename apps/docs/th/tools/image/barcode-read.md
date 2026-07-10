---
description: "สแกนรูปภาพหา QR code, บาร์โค้ด และโค้ด 2 มิติ พร้อมเอาต์พุตที่มีคำอธิบายกำกับ"
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: 34a2293939b2
---

# Barcode Reader {#barcode-reader}

สแกนรูปภาพที่อัปโหลดหาบาร์โค้ดและ QR code ทุกประเภท ส่งคืนข้อความที่ถอดรหัส, ประเภทบาร์โค้ด และข้อมูลตำแหน่งของแต่ละโค้ดที่ตรวจพบ นอกจากนี้ยังสร้างรูปภาพที่มีคำอธิบายกำกับพร้อมกล่องขอบเขตสีรอบ ๆ โค้ดที่ตรวจพบ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

รับข้อมูลแบบ multipart form data พร้อมไฟล์รูปภาพและฟิลด์ JSON `settings` ที่เป็นทางเลือก

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | No | `true` | เปิดใช้โหมดสแกนแบบเข้มข้นสำหรับบาร์โค้ดที่อ่านยากกว่า (ช้ากว่าแต่ละเอียดกว่า) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Example Response {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | ชื่อไฟล์ต้นฉบับ |
| barcodes | array | อาร์เรย์ของอ็อบเจกต์บาร์โค้ดที่ตรวจพบ |
| annotatedUrl | string or null | URL สำหรับดาวน์โหลดรูปภาพที่มีคำอธิบายกำกับ (null หากไม่พบบาร์โค้ด) |
| previewUrl | string or null | เหมือนกับ annotatedUrl (เพื่อความเข้ากันได้กับการแสดงตัวอย่างในฟรอนต์เอนด์) |

### Barcode Object {#barcode-object}

| Field | Type | Description |
|-------|------|-------------|
| type | string | รูปแบบบาร์โค้ด (QRCode, EAN-13, Code128, DataMatrix, PDF417 ฯลฯ) |
| text | string | เนื้อหาที่ถอดรหัสของบาร์โค้ด |
| position | object | กล่องขอบเขตพร้อมพิกัด topLeft, topRight, bottomLeft, bottomRight |

## Supported Barcode Types {#supported-barcode-types}

บาร์โค้ด 1 มิติ: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

บาร์โค้ด 2 มิติ: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Notes {#notes}

- ใช้ไลบรารี zxing-wasm สำหรับตรวจจับบาร์โค้ด
- รูปภาพที่มีคำอธิบายกำกับจะซ้อนกล่องขอบเขตรูปหลายเหลี่ยมสีและป้ายกำกับที่มีหมายเลขบนบาร์โค้ดที่ตรวจพบแต่ละอัน
- ตรวจจับได้สูงสุด 255 บาร์โค้ดในรูปภาพเดียว
- หากไม่พบบาร์โค้ด `barcodes` จะเป็นอาร์เรย์ว่าง และ `annotatedUrl` จะเป็น null
- โหมด `tryHarder` ทำการสแกนอย่างละเอียดมากขึ้นโดยแลกกับเวลาประมวลผล ปิดใช้งานเพื่อประมวลผลบาร์โค้ดที่สะอาดและจัดวางเรียบร้อยได้เร็วขึ้น
- เอาต์พุตที่มีคำอธิบายกำกับเป็นรูปแบบ PNG เสมอ
- อินพุต HEIC, RAW, PSD และ SVG จะถูกถอดรหัสอัตโนมัติก่อนสแกน
- ทิศทาง EXIF จะถูกนำมาใช้อัตโนมัติก่อนประมวลผล
