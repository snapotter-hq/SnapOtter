---
description: "ครอปทุกหน้าของ PDF ด้วยระยะขอบหรือครอปเป็นพื้นที่ที่กำหนด"
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: c8a8f0df0d05
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

ครอปทุกหน้าของ PDF ด้วยระยะขอบเดียวกันทุกขอบ ระยะขอบแยกแต่ละขอบ หรือครอปเหลือเฉพาะพื้นที่ที่กำหนด เช่น ป้ายจัดส่งที่พิมพ์อยู่มุมหนึ่งของแผ่น

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

รับข้อมูลแบบ multipart form data พร้อมไฟล์ PDF และฟิลด์ JSON `settings`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`, หรือ `region` |
| margin | number | No | `20` | โหมด `uniform`: ระยะขอบครอปสำหรับทุกขอบเป็นพอยต์ (0-2000) |
| top, right, bottom, left | number | No | `0` | โหมด `sides`: ระยะขอบครอปสำหรับแต่ละขอบเป็นพอยต์ (0-2000) |
| x, y | number | No | `0` | โหมด `region`: ระยะของพื้นที่จากขอบซ้ายและขอบบนของหน้าเป็นพอยต์ |
| width, height | number | No | `288`, `432` | โหมด `region`: ขนาดของพื้นที่เป็นพอยต์ (ป้ายขนาด 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

เก็บไว้เฉพาะป้ายขนาด 4x6 in ที่มุมซ้ายบนของแต่ละหน้า:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- ค่าทั้งหมดมีหน่วยเป็นพอยต์ของ PDF (1 พอยต์ = 1/72 นิ้ว) หน้า US Letter มีขนาด 612 x 792 พอยต์
- แต่ละโหมดอ่านเฉพาะฟิลด์ของตัวเอง ดังนั้นคำขอที่ส่งเพียง `margin` จึงยังทำงานได้ตามเดิม
- พื้นที่จะวัดจากมุมซ้ายบนของแต่ละหน้า และต้องอยู่ภายในทุกหน้า ระยะขอบต้องเหลือพื้นที่ของแต่ละหน้าไว้บ้าง ไม่เช่นนั้นคำขอจะล้มเหลวพร้อม `400`
- บนหน้าที่ตั้งค่าให้แสดงแบบหมุน ตำแหน่งและขอบจะอ้างอิงถึงหน้าตามที่แสดงอยู่ ดังนั้นมุมซ้ายบนของพื้นที่คือมุมซ้ายบนของหน้าที่หมุนแล้ว
- ทุกโหมดวัดจาก media box เต็มขนาด ดังนั้นการครอปหน้าที่ถูกครอปไว้แล้วจะเริ่มใหม่จากหน้าเต็ม ระยะขอบเท่ากันทุกด้านที่ `0` จะแสดง media box ทั้งหมด
