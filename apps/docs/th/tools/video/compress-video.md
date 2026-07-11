---
description: "ลดขนาดไฟล์วิดีโอพร้อมควบคุมคุณภาพ"
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: bb162b8009ff
---

# Compress Video {#compress-video}

ลดขนาดไฟล์วิดีโอโดยใช้ระดับการบีบอัดที่กำหนดค่าได้ และการลดความละเอียดเสริม

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings` นี่คือ endpoint แบบ async โดยจะคืนค่า `202 Accepted` ทันที และความคืบหน้าจะถูกสตรีมผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | ระดับการบีบอัด: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | ความละเอียดเอาต์พุต: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- พรีเซ็ต `light` คงคุณภาพให้ใกล้เคียงต้นฉบับ ส่วนพรีเซ็ต `strong` ลดขนาดไฟล์อย่างมากโดยแลกกับความคมชัดของภาพ
- การลดความละเอียด (เช่น จาก 4K เป็น 720p) จะเสริมกับการบีบอัดเพื่อลดขนาดได้อย่างมีนัยสำคัญ
- การอัปเดตความคืบหน้าดูได้ผ่าน SSE ที่ `GET /api/v1/jobs/{jobId}/progress` จนกว่างานจะเสร็จสมบูรณ์
