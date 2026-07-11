---
description: "ปรับสเกลวิดีโอเป็นความละเอียดใหม่หรือขนาดพรีเซ็ต"
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: d8c1f10a9885
---

# Resize Video {#resize-video}

ปรับสเกลวิดีโอเป็นความละเอียดใหม่โดยใช้ขนาดพิกเซลกำหนดเองหรือพรีเซ็ตมาตรฐาน

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | ความกว้างเป้าหมายเป็นพิกเซล (16-7680) |
| height | integer | No | - | ความสูงเป้าหมายเป็นพิกเซล (16-4320) |
| preset | string | No | `"custom"` | พรีเซ็ตความละเอียด: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

เมื่อ `preset` เป็น `"custom"` ต้องระบุ `width` หรือ `height` อย่างน้อยหนึ่งค่า อีกมิติหนึ่งจะปรับสเกลตามสัดส่วน

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

ปรับขนาดเป็นมิติกำหนดเอง:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- ค่าพรีเซ็ตแมปไปยังความสูงมาตรฐาน (เช่น `720p` = 1280x720, `1080p` = 1920x1080) ความกว้างจะปรับสเกลตามสัดส่วนจากอัตราส่วนภาพต้นฉบับ
- ขนาดจะถูกปัดเป็นเลขคู่ตามที่โคเดกวิดีโอส่วนใหญ่กำหนด
- ความละเอียดสูงสุดที่รองรับคือ 7680x4320 (8K UHD)
