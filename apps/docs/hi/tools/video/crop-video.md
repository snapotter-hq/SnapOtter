---
description: "किसी वीडियो में से एक क्षेत्र क्रॉप करें।"
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: e3c532858c83
---

# Crop Video {#crop-video}

क्षेत्र का आकार और स्थिति निर्दिष्ट करके किसी वीडियो में से एक आयताकार क्षेत्र क्रॉप करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

एक वीडियो फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | पिक्सेल में क्रॉप क्षेत्र की चौड़ाई (न्यूनतम 16) |
| height | integer | Yes | - | पिक्सेल में क्रॉप क्षेत्र की ऊँचाई (न्यूनतम 16) |
| x | integer | No | `0` | ऊपरी-बाएँ कोने से क्षैतिज ऑफ़सेट |
| y | integer | No | `0` | ऊपरी-बाएँ कोने से ऊर्ध्वाधर ऑफ़सेट |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- क्रॉप क्षेत्र वीडियो आयामों के भीतर फिट होना चाहिए। यदि `x + width` या `y + height` स्रोत आकार से अधिक हो, तो अनुरोध 400 त्रुटि लौटाता है।
- न्यूनतम क्रॉप आकार 16x16 पिक्सेल है।
- अधिकांश वीडियो कोडेक की आवश्यकता के अनुसार आयामों को सम संख्याओं में गोल किया जाता है।
