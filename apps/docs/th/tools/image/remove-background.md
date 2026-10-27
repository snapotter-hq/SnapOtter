---
description: "การลบพื้นหลังด้วย AI พร้อมเอฟเฟกต์เสริม (เบลอ เงา ไล่ระดับสี พื้นหลังกำหนดเอง)"
i18n_source_hash: 0814cd471fc1
i18n_provenance: human
i18n_output_hash: 8ab0c322536f
---

# Remove Background {#remove-background}

การลบพื้นหลังด้วย AI พร้อมเอฟเฟกต์เสริม (เบลอ เงา ไล่ระดับสี พื้นหลังกำหนดเอง)

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/remove-background`

**Processing:** แบบอะซิงโครนัส (คืนค่า 202, poll `/api/v1/jobs/{jobId}/progress` เพื่อดูสถานะผ่าน SSE)

**Model bundle:** `background-removal` (4-5 GB)

## Parameters {#parameters}

Phase 1 จะลบพื้นหลังและแคชมาสก์ PNG แบบโปร่งใสและรูปภาพต้นฉบับไว้ การแทนที่พื้นหลัง การเบลอ เงาตกกระทบ และการแปลงรูปแบบเอาต์พุตจะถูกนำไปใช้ใน [Phase 2 (`/api/v1/tools/image/remove-background/effects`)](#effects-endpoint-phase-2) (หรือเมื่อรัน `remove-background` เป็นขั้นตอนในไปป์ไลน์หรืองานแบบชุด) การส่งฟิลด์เหล่านั้นไปยัง Phase 1 จะคืนค่า 400

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| model | string | No | - | รุ่นโมเดล AI ที่จะใช้ |
| edgeRefine | integer | No | - | ระดับการปรับแต่งขอบ (0-3) |
| decontaminate | boolean | No | - | ลบสีที่เลอะจากขอบ |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background \
  -F "file=@photo.jpg" \
  -F 'settings={"model":"birefnet-portrait","edgeRefine":2,"decontaminate":true}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Removing background...","percent":50}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "maskUrl": "/api/v1/download/{jobId}/photo_mask.png",
    "originalSize": 245000,
    "processedSize": 180000,
    "filename": "photo.jpg",
    "model": "rembg"
  }
}
```

## Effects Endpoint (Phase 2) {#effects-endpoint-phase-2}

`POST /api/v1/tools/image/remove-background/effects`

ใช้เอฟเฟกต์พื้นหลังซ้ำโดยไม่ต้องรันโมเดล AI ใหม่ ใช้มาสก์และต้นฉบับที่แคชไว้จาก Phase 1

### Parameters {#parameters-1}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| settings | JSON | Yes | - | JSON พร้อมการตั้งค่าเอฟเฟกต์ (ดูด้านล่าง) |
| backgroundImage | file | Required when `backgroundType` is `image` | - | รูปภาพพื้นหลังที่กำหนดเอง |

#### Settings JSON fields {#settings-json-fields}

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID งานจาก Phase 1 |
| filename | string | Yes | - | ชื่อไฟล์ต้นฉบับจาก Phase 1 |
| backgroundType | string | No | `"transparent"` | หนึ่งใน: `transparent`, `color`, `gradient`, `blur`, `image` |
| backgroundColor | string | Required when `backgroundType` is `color` | - | สี hex: `#RRGGBB` หรือ `#RGB` (เครื่องหมาย `#` ไม่บังคับ) |
| gradientColor1 | string | Required when `backgroundType` is `gradient` | - | สีไล่ระดับสีแรก แบบ hex เหมือน `backgroundColor` |
| gradientColor2 | string | Required when `backgroundType` is `gradient` | - | สีไล่ระดับสีที่สอง แบบ hex เหมือน `backgroundColor` |
| gradientAngle | number | No | - | มุมไล่ระดับสีเป็นองศา |
| blurEnabled | boolean | No | - | เบลอพื้นหลังต้นฉบับด้านหลังวัตถุ (`backgroundType: "blur"` หมายถึงเปิดใช้) |
| blurIntensity | number | No | - | ความเข้มของเบลอ (0-100) |
| shadowEnabled | boolean | No | - | เปิดใช้เงาตกกระทบบนวัตถุ |
| shadowOpacity | number | No | `35` | ความทึบของเงา (0-100) ใช้เมื่อ `shadowEnabled` เป็น true |
| outputFormat | string | No | `"png"` | รูปแบบเอาต์พุต: `png`, `webp` หรือ `avif` |

### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/remove-background/effects \
  -F 'settings={"jobId":"a1b2c3d4-...","filename":"photo.jpg","backgroundType":"color","backgroundColor":"#FF5500","outputFormat":"png"}'
```

### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo_nobg.png",
  "processedSize": 195000
}
```

#### Error: Background Removal Expired (410) {#error-background-removal-expired-410}

ปลายทาง effects ทำงานจากมาสก์และต้นฉบับที่ Phase 1 จัดเก็บไว้สำหรับ `jobId` เอาต์พุตที่จัดเก็บไว้จะถูกล้างออกไปตามเวลา หากเวลาผ่านไปนานเกินไประหว่างการเรียกสองครั้ง พวกมันจะหายไป ให้รัน Phase 1 อีกครั้งด้วยภาพเดิมและใช้ `jobId` ที่ได้กลับมา

```json
{
  "error": "This image's background removal has expired. Remove the background again.",
  "code": "BACKGROUND_REMOVAL_EXPIRED"
}
```

`jobId` หรือ `filename` ที่ระบุไฟล์ที่จัดเก็บไว้ไม่ได้ (มีเครื่องหมายคั่นพาธ, `..`, สตริงว่าง) จะตอบกลับ 400

## Notes {#notes}

- ต้องติดตั้ง model bundle `background-removal` (4-5 GB)
- Phase 1 จะแคชมาสก์โปร่งใสและรูปภาพต้นฉบับไว้ เพื่อให้ Phase 2 (เอฟเฟกต์) ใช้พื้นหลังต่าง ๆ ซ้ำได้ทันทีโดยไม่ต้องรันโมเดล AI ใหม่
- รองรับรูปแบบอินพุต HEIC/HEIF, RAW, TGA, PSD, EXR และ HDR ผ่านการถอดรหัสอัตโนมัติ
- การหมุนตาม EXIF จะถูกแก้ไขอัตโนมัติก่อนการประมวลผล
