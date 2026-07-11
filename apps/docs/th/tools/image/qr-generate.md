---
description: "สร้าง QR code ด้วยสีที่กำหนดเองและระดับการแก้ไขข้อผิดพลาด"
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 04f877f58cab
---

# QR Code Generator {#qr-code-generator}

สร้างรูปภาพ QR code จากข้อความหรือ URL พร้อมกำหนดขนาด ระดับการแก้ไขข้อผิดพลาด และสีพื้นหน้า/พื้นหลังที่กำหนดเองได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

รับ **JSON body** (ไม่ใช่ multipart) ไม่จำเป็นต้องอัปโหลดไฟล์

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | เนื้อหาที่จะเข้ารหัสใน QR code (1 ถึง 2000 อักขระ) |
| size | number | No | `400` | ความกว้าง/ความสูงของรูปภาพเอาต์พุตเป็นพิกเซล (100 ถึง 10000) |
| errorCorrection | string | No | `"M"` | ระดับการแก้ไขข้อผิดพลาด: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | No | `"#000000"` | สีพื้นหน้า/โมดูลของ QR code แบบ hex (`#RRGGBB`) |
| background | string | No | `"#FFFFFF"` | สีพื้นหลังของ QR code แบบ hex (`#RRGGBB`) |
| logoDataUri | string | No | - | รูปภาพโลโก้เป็น data URI (`data:image/png;base64,...` หรือ `data:image/jpeg;base64,...` สูงสุด 700 KB) จัดวางไว้ตรงกลาง QR code ที่ 22% ของขนาด QR บังคับการแก้ไขข้อผิดพลาดเป็น `H` |

### Error Correction Levels {#error-correction-levels}

| Level | Recovery | Use Case |
|-------|----------|----------|
| `L` | ~7% | ความหนาแน่นข้อมูลสูงสุด |
| `M` | ~15% | สมดุล (ค่าเริ่มต้น) |
| `Q` | ~25% | เหมาะกับโค้ดที่พิมพ์ |
| `H` | ~30% | ดีที่สุดสำหรับโค้ดที่มีโลโก้ซ้อนทับ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

QR code แบบมีแบรนด์พร้อมสีที่กำหนดเอง:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notes {#notes}

- endpoint นี้รับ JSON ไม่ใช่ multipart form data เนื่องจากไม่ต้องอัปโหลดรูปภาพ
- เอาต์พุตเป็นรูปภาพ PNG เสมอ
- ชื่อไฟล์เอาต์พุตคือ `qrcode.png` เสมอ
- `originalSize` เป็น 0 เสมอ เนื่องจากเครื่องมือนี้สร้างรูปภาพขึ้นใหม่ตั้งแต่ต้น
- มี quiet zone (ขอบ) ขนาด 2 โมดูลล้อมรอบ QR code
- ความยาวข้อความสูงสุดคือ 2000 อักขระ ความจุจริงขึ้นอยู่กับระดับการแก้ไขข้อผิดพลาดและการเข้ารหัสอักขระ
- ระดับการแก้ไขข้อผิดพลาดที่สูงขึ้นทำให้ QR code ยังสแกนได้แม้จะถูกบดบังบางส่วน แต่จะลดความจุข้อมูล
- เมื่อระบุ `logoDataUri` การแก้ไขข้อผิดพลาดจะถูกบังคับเป็น `H` (30%) โดยอัตโนมัติ เพื่อให้ QR code ยังสแกนได้แม้โลโก้จะบดบังตรงกลาง
