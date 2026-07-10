---
description: "ซ้อนโลโก้หรือภาพเป็นลายน้ำพร้อมกำหนดตำแหน่ง ความทึบ และมาตราส่วนได้"
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: f62cb4fc84b6
---

# Image Watermark {#image-watermark}

ซ้อนโลโก้หรือภาพรองเป็นลายน้ำบนภาพหลัก ลายน้ำจะถูกปรับขนาดสัมพันธ์กับความกว้างของภาพหลักและวางที่มุมหรือกึ่งกลาง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

รับ multipart form data พร้อมไฟล์ภาพ **สอง** ไฟล์และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| position | string | No | `"bottom-right"` | ตำแหน่งลายน้ำ: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right` |
| opacity | number | No | `50` | เปอร์เซ็นต์ความทึบของลายน้ำ (0 ถึง 100) |
| scale | number | No | `25` | ความกว้างลายน้ำเป็นเปอร์เซ็นต์ของความกว้างภาพหลัก (1 ถึง 100) |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | ภาพหลัก/ภาพพื้นฐาน |
| watermark | Yes | ภาพลายน้ำ/โลโก้ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## Notes {#notes}

- ภาพทั้งสองจะถูกตรวจสอบและถอดรหัส (รองรับ HEIC, RAW, PSD, SVG)
- ลายน้ำจะถูกปรับขนาดตามสัดส่วนให้ความกว้างเท่ากับ `scale`% ของความกว้างภาพหลัก
- ความทึบถูกนำไปใช้ผ่าน alpha mask ที่ซ้อนด้วยการผสม `dest-in`
- ตำแหน่งมุมใช้ระยะขอบ 20px จากขอบภาพ
- หากภาพลายน้ำมีความโปร่งใส (เช่น โลโก้ PNG) จะถูกรักษาไว้ระหว่างการซ้อน
- ทิศทาง EXIF จะถูกนำมาใช้อัตโนมัติกับภาพทั้งสองก่อนประมวลผล
