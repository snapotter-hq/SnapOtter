---
description: "ลดขนาดไฟล์ภาพตามระดับคุณภาพหรือให้ได้ขนาดไฟล์เป้าหมาย"
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: cb7e7df3175b
---

# Compress {#compress}

ลดขนาดไฟล์ภาพโดยการระบุระดับคุณภาพหรือขนาดไฟล์เป้าหมายเป็นกิโลไบต์ เครื่องมือใช้การค้นหาแบบไบนารีซ้ำ ๆ เพื่อให้ได้ขนาดเป้าหมายอย่างแม่นยำ

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compress`

รับข้อมูลฟอร์ม multipart พร้อมไฟล์ภาพและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | โหมดการบีบอัด: `quality` หรือ `targetSize` |
| quality | number | No | `80` | ระดับคุณภาพ (1-100) ใช้เมื่อ mode เป็น `quality` |
| targetSizeKb | number | No | - | ขนาดไฟล์เป้าหมายเป็นกิโลไบต์ ใช้เมื่อ mode เป็น `targetSize` |

## Example Request {#example-request}

บีบอัดที่คุณภาพ 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

บีบอัดให้ได้ขนาดเป้าหมาย 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Notes {#notes}

- ในโหมด `quality` ค่าที่ต่ำกว่าจะให้ไฟล์ขนาดเล็กกว่าพร้อมสิ่งแปลกปลอมจากการบีบอัดมากขึ้น ค่า 80 เป็นค่าเริ่มต้นที่ดีสำหรับการใช้งานบนเว็บ
- ในโหมด `targetSize` เอนจินจะทำการบีบอัดซ้ำ ๆ เพื่อให้ได้ใกล้เคียงกับเป้าหมายมากที่สุดโดยไม่เกิน
- รูปแบบเอาต์พุตตรงกับรูปแบบอินพุต การบีบอัดจะใช้กับการเข้ารหัสดั้งเดิมของรูปแบบนั้น (เช่น คุณภาพ JPEG สำหรับไฟล์ JPEG, คุณภาพ WebP สำหรับไฟล์ WebP)
- หากยอมรับคุณภาพเริ่มต้น (80) ได้ คุณสามารถละเว้นพารามิเตอร์ `quality` ไปได้ทั้งหมด
