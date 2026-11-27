---
description: "ตัดช่วงหนึ่งออกจากไฟล์เสียงโดยระบุเวลาเริ่มต้นและสิ้นสุด"
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: c3e2d39b81ad
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

ตัดช่วงหนึ่งออกจากไฟล์เสียง โดยเลือกเก็บช่วงระหว่างเวลาเริ่มต้นและสิ้นสุด หรือตัดปริมาณคงที่ออกจากต้นและท้ายไฟล์

ในแอป ช่องเวลารับค่าเป็นวินาทีล้วน (`90`), `MM:SS` (`1:30`) หรือ `HH:MM:SS` (`1:02:03.5`) ส่วน API รับเป็นวินาที

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

รับข้อมูล multipart form ที่มีไฟล์เสียงและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` เก็บช่วง `startS` ถึง `endS` ส่วน `ends` ตัด `cutStartS` ออกจากต้นไฟล์และ `cutEndS` ออกจากท้ายไฟล์ |
| startS | number | No | `0` | โหมด range: เวลาเริ่มต้นเป็นวินาที (ต่ำสุด 0) |
| endS | number | Range mode | - | โหมด range: เวลาสิ้นสุดเป็นวินาที (ต้องอยู่หลังเวลาเริ่มต้น) |
| cutStartS | number | No | `0` | โหมด ends: จำนวนวินาทีที่ตัดออกจากต้นไฟล์ |
| cutEndS | number | No | `0` | โหมด ends: จำนวนวินาทีที่ตัดออกจากท้ายไฟล์ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

ตัด 2 วินาทีแรกและ 3 วินาทีสุดท้าย ไม่ว่าไฟล์จะยาวเท่าใด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- เวลาระบุเป็นวินาทีและมีทศนิยมได้ (เช่น `10.5`)
- ในโหมด range `endS` ต้องมากกว่า `startS` หาก `endS` เกินความยาวของเสียง ไฟล์จะถูกตัดถึงจุดสิ้นสุด
- ในโหมด ends ต้องมีอย่างน้อยหนึ่งค่าระหว่าง `cutStartS` และ `cutEndS` ที่มากกว่าศูนย์ และเมื่อรวมกันแล้วต้องเหลือเสียงอย่างน้อย 0.1 วินาที เนื่องจากการตัดวัดจากความยาวของแต่ละไฟล์ การตั้งค่าเดียวจึงใช้ได้กับไฟล์หลายไฟล์ที่ความยาวต่างกันในชุดเดียวกัน
- โดยปกติผลลัพธ์จะคงคอนเทนเนอร์ของอินพุตไว้ อินพุต AAC จะถูกเขียนเป็น M4A และอินพุตที่ถอดรหัสได้เท่านั้นซึ่งไม่รองรับจะย้อนกลับไปเป็น MP3
