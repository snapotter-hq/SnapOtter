---
description: "รวมแทร็กคำบรรยายเข้าไปในคอนเทนเนอร์วิดีโอ"
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 0482713d4e1b
---

# Embed Subtitles {#embed-subtitles}

รวมไฟล์คำบรรยายเข้าไปในคอนเทนเนอร์วิดีโอเป็นแทร็กคำบรรยายแบบ soft ที่ผู้ชมสามารถเปิดหรือปิดได้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและไฟล์คำบรรยาย รวมถึงฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | รหัสภาษา ISO 639-2/B (ตัวพิมพ์เล็ก 3 ตัว เช่น `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- อัปโหลดสองไฟล์: ไฟล์แรกต้องเป็นวิดีโอ ไฟล์ที่สองต้องเป็นไฟล์คำบรรยาย (.srt, .vtt หรือ .ass)
- คำบรรยายแบบฝัง (soft) ผู้ชมสามารถเปิด/ปิดได้ในโปรแกรมเล่นสื่อของตน หากต้องการคำบรรยายที่มองเห็นอย่างถาวร ให้ใช้เครื่องมือ Burn Subtitles แทน
- รหัสภาษาจะถูกจัดเก็บเป็นเมทาดาทาในคอนเทนเนอร์และช่วยให้โปรแกรมเล่นสื่อระบุป้ายกำกับแทร็กคำบรรยายได้
