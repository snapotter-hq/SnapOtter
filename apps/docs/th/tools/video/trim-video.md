---
description: "ตัดคลิปออกจากวิดีโอโดยระบุเวลาเริ่มต้นและสิ้นสุด"
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: eca267e4027b
i18n_hash_version: 2
---

# Trim Video {#trim-video}

ตัดคลิปออกจากวิดีโอ จะเก็บส่วนที่อยู่ระหว่างเวลาเริ่มต้นและเวลาสิ้นสุด หรือจะตัดช่วงคงที่ออกจากต้นและท้ายก็ได้ มีตัวเลือกสำหรับการตัดที่แม่นยำระดับเฟรมด้วย

ในแอป ช่องเวลารับเป็นวินาทีล้วน (`90`), `MM:SS` (`1:30`) หรือ `HH:MM:SS` (`1:02:03.5`) ส่วน API รับเป็นวินาที

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

รับข้อมูลแบบ multipart form พร้อมไฟล์วิดีโอและฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` เก็บช่วง `startS` ถึง `endS` ส่วน `ends` ลบ `cutStartS` จากต้นและ `cutEndS` จากท้าย |
| startS | number | No | `0` | โหมด range: เวลาเริ่มต้นเป็นวินาที (ต้อง >= 0) |
| endS | number | Range mode | - | โหมด range: เวลาสิ้นสุดเป็นวินาที (ต้องอยู่หลัง startS) |
| cutStartS | number | No | `0` | โหมด ends: จำนวนวินาทีที่ลบจากต้น |
| cutEndS | number | No | `0` | โหมด ends: จำนวนวินาทีที่ลบจากท้าย |
| precise | boolean | No | `false` | เข้ารหัสใหม่ทั้งช่วงเพื่อให้เฟรมเริ่มต้นและสิ้นสุดแม่นยำ แทนการคัดลอกจาก keyframe ถัดไป |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

ตัด 5 วินาทีแรกและ 10 วินาทีสุดท้ายออก ไม่ว่าวิดีโอจะยาวเท่าใด:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- เมื่อ `precise` เป็น `false` (ค่าเริ่มต้น) คลิปจะเริ่มที่เฟรมที่ร้องขอพอดี เฉพาะเฟรมตั้งแต่จุดเริ่มต้นนั้นถึง keyframe ถัดไปเท่านั้นที่ถูกเข้ารหัสใหม่ ส่วนที่เหลือจะถูกคัดลอก จึงยังคงเร็ว ส่วนท้ายอาจยาวเกินไปประมาณหนึ่งเฟรม เพราะสตรีมที่คัดลอกจะเก็บเฟรมที่เฟรมก่อนหน้าต้องพึ่งพาไว้ แหล่งที่ต่อไม่ได้อย่างปลอดภัย (H.264 แบบ 10 บิตหรือแบบ interlaced, โคเดกอื่นที่ต้องเข้ารหัสส่วนเริ่มต้นใหม่ หรือไฟล์ AVI, FLV, MPEG และ TS) จะถูกเข้ารหัสใหม่ทั้งหมดแทน
- การตั้ง `precise` เป็น `true` จะเข้ารหัสใหม่ทั้งช่วงเสมอ ทำให้ทั้งสองปลายแม่นยำ แต่ใช้เวลานานกว่า
- ในโหมด range `endS` ต้องมากกว่า `startS` หาก `endS` เกินความยาวของวิดีโอ คลิปจะยาวไปจนจบ
- ในโหมด ends อย่างน้อยหนึ่งใน `cutStartS` และ `cutEndS` ต้องมากกว่าศูนย์ และเมื่อรวมกันแล้วต้องเหลือส่วนของวิดีโออยู่ เนื่องจากการตัดวัดจากความยาวของแต่ละไฟล์ การตั้งค่าเดียวจึงใช้ได้กับวิดีโอหลายไฟล์ที่มีความยาวต่างกัน
