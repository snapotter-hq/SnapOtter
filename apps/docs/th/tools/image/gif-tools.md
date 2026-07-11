---
description: "ปรับขนาด ปรับให้เหมาะสม เปลี่ยนความเร็ว ย้อนกลับ หมุน และแยกเฟรมจาก GIF เคลื่อนไหวในเครื่องมือเดียว"
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: f7c699b57e43
---

# GIF Tools {#gif-tools}

ปรับขนาด ปรับให้เหมาะสม เปลี่ยนความเร็ว ย้อนกลับ แยกเฟรม และหมุน GIF เคลื่อนไหว มีโหมดการทำงานหลายแบบในเครื่องมือเดียว

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameters {#parameters}

### Common Parameters {#common-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"resize"` | โหมดการทำงาน: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | No | 0 | จำนวนรอบการวนซ้ำสำหรับ GIF ที่ได้ (0 = ไม่จำกัด, 1-100 = จำนวนรอบที่จำกัด) |

### Resize Mode Parameters {#resize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | ความกว้างเป้าหมายเป็นพิกเซล (1 ถึง 16384) |
| height | integer | No | - | ความสูงเป้าหมายเป็นพิกเซล (1 ถึง 16384) |
| percentage | number | No | - | ปรับสัดส่วนตามเปอร์เซ็นต์ (1 ถึง 500) แทนที่ width/height หากตั้งค่า |

### Optimize Mode Parameters {#optimize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colors | number | No | 256 | จำนวนสีสูงสุดในจานสี (2 ถึง 256) |
| dither | number | No | 1.0 | ความเข้มของ dithering (0 ถึง 1 โดย 0 ปิดการใช้งาน dithering) |
| effort | number | No | 7 | ระดับความพยายามในการปรับให้เหมาะสม (1 ถึง 10 ยิ่งสูง = ช้าลงแต่เล็กลง) |

### Speed Mode Parameters {#speed-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| speedFactor | number | No | 1.0 | ตัวคูณความเร็ว (0.1 ถึง 10) ค่า > 1 เร่งความเร็ว, < 1 ทำให้ช้าลง |

### Extract Mode Parameters {#extract-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| extractMode | string | No | `"single"` | โหมดการแยก: `single`, `range`, `all` |
| frameNumber | number | No | 0 | ดัชนีเฟรมที่จะแยกในโหมด `single` (เริ่มจาก 0) |
| frameStart | number | No | 0 | ดัชนีเฟรมเริ่มต้นสำหรับโหมด `range` (เริ่มจาก 0) |
| frameEnd | number | No | - | ดัชนีเฟรมสิ้นสุดสำหรับโหมด `range` (เริ่มจาก 0, รวมค่านี้ด้วย) |
| extractFormat | string | No | `"png"` | รูปแบบสำหรับเฟรมที่แยก: `png`, `webp` |

### Rotate Mode Parameters {#rotate-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | - | มุมการหมุน: `90`, `180`, หรือ `270` องศา |
| flipH | boolean | No | `false` | พลิกแนวนอน |
| flipV | boolean | No | `false` | พลิกแนวตั้ง |

## Example Requests {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Speed Up {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extract Single Frame {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

คืนค่าเมทาดาทาเกี่ยวกับ GIF เคลื่อนไหวโดยไม่ประมวลผล

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info Response {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notes {#notes}

- ใช้ factory `createToolRoute` มาตรฐานสำหรับ endpoint การประมวลผลหลัก
- endpoint ข้อมูลต้องการเพียงการอัปโหลดไฟล์เท่านั้น (ไม่ต้องมีการตั้งค่า)
- ในโหมด `resize` หากมีการระบุ `percentage` จะมีความสำคัญเหนือ `width`/`height` การปรับขนาดใช้ `fit: inside` เพื่อรักษาสัดส่วนภาพ
- ในโหมด `speed` ความล่าช้าของเฟรมจะถูกหารด้วย speed factor ความล่าช้าต่ำสุดต่อเฟรมคือ 20ms (ข้อจำกัดของ GIF spec)
- ในโหมด `reverse` พารามิเตอร์ `speedFactor` ก็ใช้ได้เช่นกันเพื่อปรับความเร็วพร้อมกับการย้อนกลับ
- ในโหมด `extract` ที่มี `range` หรือ `all` ผลลัพธ์จะเป็นไฟล์ ZIP ที่มีเฟรมแต่ละเฟรม
- ในโหมด `rotate` แต่ละเฟรมจะถูกประมวลผลทีละเฟรมและประกอบกลับเป็นภาพเคลื่อนไหว
- พารามิเตอร์ `loop` ควบคุมว่า GIF ที่ได้จะวนซ้ำกี่ครั้ง ใช้ 0 สำหรับการวนซ้ำไม่จำกัด
- ฟิลด์ `duration` ในการตอบกลับข้อมูลคือระยะเวลาภาพเคลื่อนไหวทั้งหมดในหน่วยมิลลิวินาที
