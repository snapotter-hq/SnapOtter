---
description: "ดึงเฟรมออกจากวิดีโอเป็นไฟล์ ZIP ของรูปภาพ"
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: d417bfb81fba
---

# Video to Frames {#video-to-frames}

ดึงเฟรมแต่ละเฟรมออกจากวิดีโอและดาวน์โหลดเป็นไฟล์ ZIP ของรูปภาพ PNG หรือ JPG

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | โหมดการดึง: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | ดึงทุกเฟรมที่ N (2-1000) ใช้เฉพาะเมื่อ mode เป็น `"nth"` |
| timestamps | string | No | `""` | เวลาประทับคั่นด้วยจุลภาคเป็นวินาที จำเป็นเมื่อ mode เป็น `"timestamps"` |
| format | string | No | `"png"` | รูปแบบรูปภาพสำหรับเฟรมที่ดึง: `png`, `jpg` |

## Example Request {#example-request}

ดึงทุกเฟรมที่ 30 เป็น JPG:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

ดึงเฟรมที่เวลาประทับที่ระบุ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- โหมด `all` จะดึงทุกเฟรมและอาจสร้างไฟล์ ZIP ที่ใหญ่มากสำหรับวิดีโอยาว ใช้โหมด `nth` หรือ `timestamps` สำหรับการดึงแบบเลือก
- PNG คงคุณภาพเต็มแต่สร้างไฟล์ใหญ่กว่า JPG เล็กกว่าแต่เป็นแบบ lossy
- การตอบกลับจะดาวน์โหลดเป็นไฟล์ ZIP ที่มีไฟล์รูปภาพเรียงหมายเลขตามลำดับ
