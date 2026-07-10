---
description: "ฝังลายน้ำข้อความลงบนเฟรมของวิดีโอ"
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: d293cc610da3
---

# Watermark Video {#watermark-video}

ฝังลายน้ำข้อความลงบนทุกเฟรมของวิดีโอ พร้อมกำหนดค่าตำแหน่ง ขนาด ความทึบแสง และสีได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| text | string | Yes | - | ข้อความลายน้ำ (1-200 อักขระ) |
| position | string | No | `"br"` | ตำแหน่งบนเฟรม: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | No | `36` | ขนาดฟอนต์เป็นพิกเซล (8-120) |
| opacity | number | No | `0.5` | ความทึบแสงของลายน้ำ (0.05-1) |
| color | string | No | `"#ffffff"` | สี Hex สำหรับข้อความ (เช่น `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - บนซ้าย, **tc** - บนกลาง, **tr** - บนขวา
- **l** - กลางซ้าย, **c** - ตรงกลาง, **r** - กลางขวา
- **bl** - ล่างซ้าย, **bc** - ล่างกลาง, **br** - ล่างขวา

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- ลายน้ำจะถูกเรนเดอร์ลงในเฟรมของวิดีโออย่างถาวรและไม่สามารถลบออกได้หลังการประมวลผล
- ลายน้ำใช้ฟอนต์ sans-serif ที่มีอยู่ในตัวของ FFmpeg
- สำหรับลายน้ำแบบรูปภาพ ให้ใช้เครื่องมือ Watermark สำหรับรูปภาพแทน
