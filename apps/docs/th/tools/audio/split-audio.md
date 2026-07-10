---
description: "แยกเสียงตามช่วงเวลา ส่วนที่เท่ากัน หรือการตรวจจับความเงียบ"
i18n_source_hash: c062a395dbac
i18n_provenance: human
i18n_output_hash: f158c2e432af
---

# Split Audio {#split-audio}

แยกไฟล์เสียงออกเป็นเซกเมนต์ตามช่วงเวลาคงที่ ส่วนที่เท่ากัน หรือการตรวจจับความเงียบอัตโนมัติ ส่งคืนไฟล์เก็บถาวร ZIP ของเซกเมนต์

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/split-audio`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"time"` | กลยุทธ์การแยก: `time`, `parts`, `silence` |
| segmentS | number | No | `60` | ความยาวเซกเมนต์เป็นวินาที 1 ถึง 3600 (ใช้เมื่อ mode เป็น `time`) |
| parts | integer | No | `2` | จำนวนส่วนที่เท่ากัน 2 ถึง 20 (ใช้เมื่อ mode เป็น `parts`) |
| thresholdDb | number | No | `-40` | เกณฑ์ความเงียบเป็น dB -80 ถึง -20 (ใช้เมื่อ mode เป็น `silence`) |
| minSilenceS | number | No | `0.3` | ช่องว่างความเงียบต่ำสุดเป็นวินาที 0.1 ถึง 10 (ใช้เมื่อ mode เป็น `silence`) |

## Example Request {#example-request}

แยกเป็นเซกเมนต์ละ 30 วินาที:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "time", "segmentS": 30}'
```

แยกด้วยการตรวจจับความเงียบ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/split-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "silence", "thresholdDb": -35, "minSilenceS": 0.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio_parts.zip",
  "originalSize": 4500000,
  "processedSize": 4600000
}
```

## Notes {#notes}

- `downloadUrl` ชี้ไปยังไฟล์เก็บถาวร ZIP ที่มีเซกเมนต์ทั้งหมด
- ใช้เฉพาะพารามิเตอร์ที่เกี่ยวข้องกับ `mode` ที่เลือกเท่านั้น ส่วนที่เหลือจะถูกละเว้น
- ชื่อไฟล์เซกเมนต์จะถูกกำหนดหมายเลขตามลำดับ (เช่น `part-000.mp3`, `part-001.mp3`)
- รูปแบบผลลัพธ์จะตรงกับรูปแบบอินพุต
