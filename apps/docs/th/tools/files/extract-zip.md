---
description: "แตกไฟล์จากไฟล์เก็บถาวร ZIP อย่างปลอดภัยพร้อมการป้องกัน bomb"
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 2426b447b784
---

# Extract ZIP {#extract-zip}

แตกไฟล์จากไฟล์เก็บถาวร ZIP อย่างปลอดภัย ไฟล์เก็บถาวรที่มีไฟล์เดียวจะส่งคืนไฟล์ที่บรรจุอยู่โดยตรง ไฟล์เก็บถาวรที่มีหลายไฟล์จะส่งคืน ZIP แบบแบนพร้อมเนื้อหาที่แตกออกมา

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

รับข้อมูล multipart form ที่มีไฟล์ ZIP ไม่จำเป็นต้องมีฟิลด์การตั้งค่า

## Parameters {#parameters}

เครื่องมือนี้ไม่มีพารามิเตอร์ที่กำหนดค่าได้ อัปโหลดไฟล์ `.zip` เพื่อแตก

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- รับเฉพาะไฟล์ `.zip` เป็นอินพุตเท่านั้น
- หากไฟล์เก็บถาวรมีไฟล์เดียว ไฟล์นั้นจะถูกส่งคืนโดยตรง (ไม่ห่อด้วย ZIP)
- หากไฟล์เก็บถาวรมีหลายไฟล์ จะส่งคืน ZIP แบบแบนพร้อมไฟล์ทั้งหมดที่แตกออกไปยังระดับราก (โครงสร้างไดเรกทอรีที่ซ้อนกันจะถูกทำให้แบน)
- การป้องกัน bomb ในตัวจะปฏิเสธไฟล์เก็บถาวรที่มีอัตราส่วนการบีบอัดหรือจำนวนไฟล์ที่มากเกินไป เพื่อป้องกันการใช้ทรัพยากรจนหมด
