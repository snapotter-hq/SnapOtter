---
description: "ครอบตัดพื้นที่ออกจากวิดีโอ"
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: eff4173c6cb4
---

# Crop Video {#crop-video}

ครอบตัดพื้นที่รูปสี่เหลี่ยมออกจากวิดีโอโดยระบุขนาดและตำแหน่งของพื้นที่นั้น

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | ความกว้างของพื้นที่ครอบตัดเป็นพิกเซล (ต่ำสุด 16) |
| height | integer | Yes | - | ความสูงของพื้นที่ครอบตัดเป็นพิกเซล (ต่ำสุด 16) |
| x | integer | No | `0` | ระยะเลื่อนแนวนอนจากมุมบนซ้าย |
| y | integer | No | `0` | ระยะเลื่อนแนวตั้งจากมุมบนซ้าย |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- พื้นที่ครอบตัดต้องอยู่ภายในขนาดของวิดีโอ หาก `x + width` หรือ `y + height` เกินขนาดต้นฉบับ คำขอจะคืนค่าข้อผิดพลาด 400
- ขนาดครอบตัดต่ำสุดคือ 16x16 พิกเซล
- ขนาดจะถูกปัดเป็นเลขคู่ตามที่โคเดกวิดีโอส่วนใหญ่กำหนด
