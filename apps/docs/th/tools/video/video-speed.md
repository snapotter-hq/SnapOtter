---
description: "เร่งความเร็วหรือชะลอความเร็ววิดีโอ"
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: 140ec89a2608
---

# Video Speed {#video-speed}

เร่งความเร็วหรือชะลอความเร็ววิดีโอ พร้อมตัวเลือกในการคงระดับเสียง (pitch) ของเสียง

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | ตัวคูณความเร็ว (0.25-4) ค่าที่มากกว่า 1 จะเร่งความเร็ว ค่าที่น้อยกว่า 1 จะชะลอความเร็ว |
| keepPitch | boolean | No | `true` | คงระดับเสียง (pitch) ไว้เมื่อเปลี่ยนความเร็ว |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- factor `2` จะเพิ่มความเร็วการเล่นเป็นสองเท่า (ลดระยะเวลาลงครึ่งหนึ่ง) factor `0.5` จะลดความเร็วการเล่นลงครึ่งหนึ่ง (เพิ่มระยะเวลาเป็นสองเท่า)
- เมื่อ `keepPitch` เป็น `true` เสียงจะถูกยืดตามเวลาเพื่อให้เสียงพูดฟังดูเป็นธรรมชาติ เมื่อ `false` ระดับเสียงจะเปลี่ยนตามสัดส่วนกับความเร็ว
- ช่วงที่ถูกต้องคือ 0.25x ถึง 4x
