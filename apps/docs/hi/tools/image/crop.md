---
description: "स्थिति और आयाम के साथ एक क्षेत्र निर्दिष्ट करके छवियों को क्रॉप करें।"
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: dfd5dda786f1
---

# इमेज क्रॉप {#crop}

स्थिति और आकार का उपयोग करके एक आयताकार क्षेत्र परिभाषित करके छवियों को क्रॉप करें। पिक्सेल और प्रतिशत दोनों इकाइयों का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/crop`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| left | number | Yes | - | क्रॉप क्षेत्र का X ऑफ़सेट (बायें किनारे से) |
| top | number | Yes | - | क्रॉप क्षेत्र का Y ऑफ़सेट (ऊपरी किनारे से) |
| width | number | Yes | - | क्रॉप क्षेत्र की चौड़ाई |
| height | number | Yes | - | क्रॉप क्षेत्र की ऊँचाई |
| unit | string | No | `"px"` | मानों के लिए इकाई: `px` या `percent` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

प्रतिशत मानों का उपयोग करके क्रॉप करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- क्रॉप क्षेत्र छवि की सीमाओं के भीतर फ़िट होना चाहिए। यदि क्षेत्र छवि से आगे बढ़ता है, तो अनुरोध विफल हो जाएगा।
- `percent` इकाई का उपयोग करते समय, मान छवि आयामों के प्रतिशत का प्रतिनिधित्व करते हैं (उदा. `left: 10` का अर्थ है बायें किनारे से 10%)।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है।
- क्रॉपिंग से पहले EXIF अभिविन्यास स्वचालित रूप से लागू किया जाता है, इसलिए निर्देशांक दृश्य रूप से सही अभिविन्यास के अनुरूप होते हैं।
