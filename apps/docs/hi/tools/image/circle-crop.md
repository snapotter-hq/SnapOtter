---
description: "किसी छवि को पारदर्शी कोनों के साथ एक केंद्रित वृत्त में क्रॉप करें।"
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: caf5c56d1c6e
---

# Circle Crop {#circle-crop}

किसी छवि को पारदर्शी कोनों के साथ एक केंद्रित वृत्त में क्रॉप करें। समायोज्य ज़ूम, ऑफसेट, बॉर्डर, और आउटपुट आकार का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | No | `1` | ज़ूम कारक (1-5); उच्च मान अधिक कसकर क्रॉप करते हैं |
| offsetX | number | No | `0.5` | क्षैतिज केंद्र स्थिति (0-1) |
| offsetY | number | No | `0.5` | ऊर्ध्वाधर केंद्र स्थिति (0-1) |
| borderWidth | integer | No | `0` | पिक्सेल में बॉर्डर चौड़ाई (0-200) |
| borderColor | string | No | `"#ffffff"` | बॉर्डर हेक्स रंग |
| background | string | No | `"transparent"` | कोना फिल: `"transparent"` या एक हेक्स रंग |
| outputSize | integer | No | - | पिक्सेल में अंतिम वर्गाकार आयाम (16-4096) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- पारदर्शी कोनों को संरक्षित करने के लिए आउटपुट हमेशा PNG होता है (जब तक `background` को एक ठोस रंग पर सेट न किया गया हो)।
- वृत्त छवि के छोटे आयाम के भीतर अंकित होता है। अधिक कसकर क्रॉप करने के लिए `zoom` का उपयोग करें और दृश्य क्षेत्र को स्थानांतरित करने के लिए `offsetX`/`offsetY` का उपयोग करें।
- जब `outputSize` प्रदान किया जाता है, तो क्रॉप करने के बाद परिणाम को उस वर्गाकार आयाम पर आकार बदला जाता है।
- HEIC, RAW, PSD, और SVG इनपुट को प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किया जाता है।
