---
description: "ปรับระดับความดังเสียงของวิดีโอให้เป็นมาตรฐานการออกอากาศ"
i18n_source_hash: c7a53b5faf1b
i18n_provenance: human
i18n_output_hash: 65ca4caaefc8
---

# นอร์มอลไลซ์เสียงวิดีโอ {#normalize-audio}

ปรับระดับความดังเสียงของวิดีโอให้เป็นมาตรฐานความดังการออกอากาศ EBU R128

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอ เครื่องมือนี้ไม่มีการตั้งค่าที่กำหนดค่าได้

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ โดยจะใช้การปรับระดับความดัง EBU R128 กับแทร็กเสียง

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- ใช้ฟิลเตอร์ `loudnorm` ของ FFmpeg โดยกำหนดเป้าหมายความดังรวม -16 LUFS พร้อม true peak -1.5 dBTP และช่วงความดัง 11 LU (มาตรฐานการออกอากาศ EBU R128)
- อัตราการสุ่มตัวอย่างเสียงต้นฉบับจะถูกคงไว้ในเอาต์พุต
- หากวิดีโอไม่มีแทร็กเสียง คำขอจะคืนค่าข้อผิดพลาด 400
