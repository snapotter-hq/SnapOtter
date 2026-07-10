---
description: "ตัวสร้างรูปถ่ายพาสปอร์ตและบัตรประชาชนด้วย AI พร้อมการตรวจจับใบหน้า การลบพื้นหลัง และการเรียงต่อสำหรับพิมพ์"
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: 95b054c1d02b
---

# Passport Photo {#passport-photo}

ตัวสร้างรูปถ่ายพาสปอร์ตและบัตรประชาชนด้วย AI ขั้นตอนการทำงานแบบสองเฟส: วิเคราะห์ (ตรวจจับใบหน้า + ลบพื้นหลัง) แล้วสร้าง (ครอป ปรับขนาด และเรียงต่อสำหรับพิมพ์)

## API Endpoints {#api-endpoints}

เครื่องมือนี้ใช้ flow แบบสองเฟส โดยมี endpoint แยกกันสำหรับการวิเคราะห์และการสร้าง

**Model bundles:** `background-removal` และ `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

ตรวจจับจุดสังเกตใบหน้า (face landmarks) และลบพื้นหลัง คืนค่าข้อมูลจุดสังเกตและพรีวิวเพื่อให้ฟรอนต์เอนด์แสดงตัวอย่างการครอป

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ไฟล์รูปภาพ (multipart) |
| clientJobId | string | No | - | ID งานเสริมสำหรับติดตามความคืบหน้าผ่าน SSE |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

หากระบุ `clientJobId` ความคืบหน้าจะถูกสตรีม (0-30% สำหรับการตรวจจับใบหน้า, 30-95% สำหรับการลบพื้นหลัง)

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

ครอป ปรับขนาด และเรียงต่อรูปถ่ายลงบนแผ่นพิมพ์ตามต้องการ ใช้รูปภาพที่แคชไว้จาก Phase 1 (ไม่มีการรัน AI ซ้ำ)

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID งานจาก Phase 1 |
| filename | string | Yes | - | ชื่อไฟล์ต้นฉบับจาก Phase 1 |
| countryCode | string | Yes | - | รหัสประเทศสำหรับข้อกำหนดพาสปอร์ต (เช่น `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | ประเภทเอกสาร (จากข้อกำหนดของประเทศ) |
| bgColor | string | No | `"#FFFFFF"` | สีพื้นหลังแบบ hex |
| printLayout | string | No | `"none"` | เลย์เอาต์กระดาษพิมพ์: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | ข้อจำกัดขนาดไฟล์สูงสุดเป็น KB (0 = ไม่จำกัด) |
| dpi | number | No | `300` | DPI เอาต์พุต (72-1200) |
| customWidthMm | number | No | - | ความกว้างรูปถ่ายที่กำหนดเองเป็นมม. (แทนที่ข้อกำหนดของประเทศ) |
| customHeightMm | number | No | - | ความสูงรูปถ่ายที่กำหนดเองเป็นมม. (แทนที่ข้อกำหนดของประเทศ) |
| zoom | number | No | `1` | ตัวคูณการซูม (0.5-3) ค่า > 1 จะครอปแน่นขึ้น |
| adjustX | number | No | `0` | การปรับตำแหน่งแนวนอน |
| adjustY | number | No | `0` | การปรับตำแหน่งแนวตั้ง |
| landmarks | object | Yes | - | ออบเจกต์จุดสังเกตจากการตอบกลับของ Phase 1 |
| imageWidth | number | Yes | - | ความกว้างรูปภาพจากการตอบกลับของ Phase 1 |
| imageHeight | number | Yes | - | ความสูงรูปภาพจากการตอบกลับของ Phase 1 |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

คืนค่าคำแนะนำให้ใช้ sub-endpoint ที่ถูกต้อง

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- ต้องติดตั้ง model bundle `background-removal` และ `face-detection`
- Phase 1 รัน AI (จุดสังเกตใบหน้า + ลบพื้นหลัง) และแคชผลลัพธ์ไว้ Phase 2 เป็นการจัดการรูปภาพด้วย Sharp ล้วน ๆ (เร็ว ไม่ต้องใช้ AI)
- จุดสังเกตจะถูกคืนค่าเป็นพิกัดแบบ normalized (ช่วง 0-1 สัมพันธ์กับมิติของรูปภาพ)
- ฟิลด์ `preview` ในการตอบกลับของ analyze เป็น PNG ที่เข้ารหัสแบบ base64 (กว้างสูงสุด 800px) เพื่อการแสดงผลที่รวดเร็ว
- ข้อกำหนดของประเทศรวมมิติเอกสาร อัตราส่วนความสูงของศีรษะ และตำแหน่งเส้นระดับสายตาตามข้อกำหนดรูปถ่ายพาสปอร์ตอย่างเป็นทางการ
- ตัวเลือก `printLayout` จะสร้างแผ่นที่เรียงต่อกันบนกระดาษ 4x6\" หรือ A4 พร้อมช่องว่าง 2มม. ระหว่างรูปถ่าย
- เมื่อตั้งค่า `maxFileSizeKb` เอาต์พุตจะถูกบีบอัดซ้ำ ๆ เพื่อให้อยู่ในขีดจำกัดขนาด
