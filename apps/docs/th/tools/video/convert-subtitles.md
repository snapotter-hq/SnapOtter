---
description: "แปลงไฟล์คำบรรยายระหว่าง SRT, WebVTT และ ASS"
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 6076d6a3c10d
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

แปลงไฟล์คำบรรยายระหว่าง SRT, WebVTT และ ASS เวลาและข้อความจะถูกคงไว้ แต่ตำแหน่งและเอฟเฟกต์ของ ASS จะไม่ถูกคงไว้

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

รับข้อมูล multipart form ที่มีไฟล์คำบรรยายหนึ่งไฟล์ (`.srt`, `.vtt` หรือ `.ass`) และฟิลด์ JSON `settings` ที่ไม่บังคับ

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | รูปแบบผลลัพธ์: `srt`, `vtt` หรือ `ass` |
| `encoding` | string | `"auto"` | การเข้ารหัสข้อความของอินพุต: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` หรือ `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- การแปลงจาก ASS จะคงเวลา ข้อความบทสนทนา และการจัดรูปแบบพื้นฐานที่รูปแบบปลายทางรองรับไว้ โดย SRT เก็บตัวเอียง ตัวหนา สี และขนาดตัวอักษรเป็นแท็ก ส่วน WebVTT เก็บตัวเอียง ตัวหนา และขีดเส้นใต้ ตำแหน่งบนหน้าจอ แอนิเมชัน และเอฟเฟกต์อื่นของ ASS จะถูกตัดออก
- ผลลัพธ์เป็น UTF-8 เสมอ เมื่อตั้ง `encoding` เป็น `auto` ไฟล์ที่เป็น UTF-8 ที่ถูกต้องจะถูกอ่านตามเดิม และไฟล์อื่นทั้งหมดจะถูกอ่านเป็น Windows-1252 ซึ่งเป็นการเข้ารหัสที่ใช้บ่อยกับไฟล์ SRT ยุโรปตะวันตกรุ่นเก่า หากตัวอักษรที่มีเครื่องหมายกำกับหรือไม่ใช่อักษรละตินแสดงผลเพี้ยน ให้ตั้ง `encoding` เป็นการเข้ารหัสจริงของไฟล์ (เช่น `gb18030` สำหรับภาษาจีนตัวย่อ หรือ `windows-1251` สำหรับอักษรซิริลลิก)
- ไฟล์คำบรรยายที่อัปโหลดถูกจำกัดที่ 1 MB โดยค่าเริ่มต้น เพิ่มหรือยกเลิกขีดจำกัดได้ด้วย `MAX_SUBTITLE_SIZE_MB`
