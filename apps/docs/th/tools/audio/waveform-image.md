---
description: "สร้างภาพแสดงรูปคลื่นเป็นภาพ PNG จากไฟล์เสียง"
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: 4fcc8e256c04
---

# Waveform Image {#waveform-image}

สร้างภาพแสดงรูปคลื่นเป็นภาพ PNG จากไฟล์เสียง พร้อมขนาดและสีที่กำหนดค่าได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | ความกว้างของภาพเป็นพิกเซล (256 ถึง 3840) |
| height | integer | No | `256` | ความสูงของภาพเป็นพิกเซล (64 ถึง 1080) |
| color | string | No | `"#4f46e5"` | สีเลขฐานสิบหกของรูปคลื่น (เช่น `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- ผลลัพธ์จะเป็นภาพ PNG เสมอ ไม่ว่ารูปแบบเสียงอินพุตจะเป็นอะไร
- รูปคลื่นจะถูกเรนเดอร์บนพื้นหลังโปร่งใส
- มีประโยชน์สำหรับภาพขนาดย่อ ภาพตัวอย่างโซเชียลมีเดีย หรือการฝังในหน้าเว็บ
