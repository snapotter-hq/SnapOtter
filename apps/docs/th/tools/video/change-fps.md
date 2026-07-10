---
description: "เปลี่ยนอัตราเฟรมของวิดีโอ"
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 19bbfa611ccc
---

# Change FPS {#change-fps}

เปลี่ยนอัตราเฟรมของวิดีโอเป็นค่าเป้าหมายระหว่าง 1 ถึง 120 fps

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | อัตราเฟรมเป้าหมาย (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- การลดอัตราเฟรมจะตัดเฟรมออกและลดขนาดไฟล์ การเพิ่มอัตราเฟรมจะทำเฟรมซ้ำเพื่อเติมช่องว่างแต่ไม่ได้เพิ่มรายละเอียดการเคลื่อนไหวจริง
- ค่าเป้าหมายที่พบบ่อย: 24 (โรงภาพยนตร์), 30 (เว็บ/การออกอากาศ), 60 (การเล่นที่ราบรื่น)
- แทร็กเสียงจะถูกคงไว้ที่อัตราการสุ่มตัวอย่างเดิม
