---
description: "เปลี่ยนชื่อไฟล์หลายไฟล์โดยใช้เทมเพลตรูปแบบ และดาวน์โหลดเป็น ZIP"
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: bebb1083900d
---

# Bulk Rename {#bulk-rename}

เปลี่ยนชื่อไฟล์หลายไฟล์โดยใช้เทมเพลตรูปแบบพร้อมตัวยึดตำแหน่งสำหรับดัชนี, ดัชนีที่เติมเลขศูนย์ และชื่อไฟล์ต้นฉบับ ส่งคืนไฟล์เก็บถาวร ZIP ที่มีไฟล์ที่เปลี่ยนชื่อทั้งหมด

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

รับข้อมูลแบบ multipart form data พร้อมไฟล์หลายไฟล์และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pattern | string | No | `"image-{{index}}"` | รูปแบบการตั้งชื่อพร้อมตัวยึดตำแหน่ง (สูงสุด 1000 ตัวอักษร) |
| startIndex | number | No | `1` | หมายเลขดัชนีเริ่มต้น |

### Pattern Placeholders {#pattern-placeholders}

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{index}}` | หมายเลขลำดับที่เริ่มจาก `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | หมายเลขลำดับที่เติมเลขศูนย์ | `01`, `02`, `03` |
| `{{original}}` | ชื่อไฟล์ต้นฉบับโดยไม่มีนามสกุล | `photo`, `IMG_001` |

นามสกุลไฟล์ต้นฉบับจะถูกรักษาไว้เสมอ

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

นี่จะผลิต: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

ใช้ชื่อไฟล์ต้นฉบับ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

นี่จะผลิต: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Example Response {#example-response}

การตอบสนองเป็นไฟล์ ZIP ที่สตรีมโดยตรง (ไม่ใช่การตอบสนอง JSON) ส่วนหัวของการตอบสนองคือ:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Notes {#notes}

- เครื่องมือนี้ไม่ประมวลผลรูปภาพ เพียงเปลี่ยนชื่อไฟล์และแพ็กลงในไฟล์เก็บถาวร ZIP เท่านั้น
- ความกว้างของการเติมเลขศูนย์สำหรับ `{{padded}}` กำหนดโดยอัตโนมัติตามจำนวนไฟล์ทั้งหมด (เช่น 100 ไฟล์จะใช้การเติม 3 หลัก: `001`, `002` เป็นต้น)
- นามสกุลไฟล์ถูกรักษาไว้จากชื่อไฟล์ต้นฉบับ
- ชื่อไฟล์ถูกทำให้ปลอดภัยโดยลบอักขระที่ไม่ปลอดภัย
- ต้องมีไฟล์อย่างน้อยหนึ่งไฟล์
