---
description: "कंपोज़िटिंग के लिए स्थिति, अपारदर्शिता, और ब्लेंड मोड के साथ छवियों को परत में रखें।"
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 7d1ab3e67559
---

# Image Composition {#image-composition}

एक ओवरले छवि को आधार छवि के ऊपर विन्यास योग्य स्थिति, अपारदर्शिता, और ब्लेंड मोड के साथ परत में रखें। लोगो, ग्राफ़िक्स, या कई छवियों को संयोजित करने के लिए उपयोगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/compose`

**दो** छवि फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| x | number | No | `0` | ऊपर-बायें कोने से ओवरले का क्षैतिज ऑफ़सेट पिक्सेल में (न्यूनतम 0) |
| y | number | No | `0` | ऊपर-बायें कोने से ओवरले का ऊर्ध्वाधर ऑफ़सेट पिक्सेल में (न्यूनतम 0) |
| opacity | number | No | `100` | ओवरले अपारदर्शिता प्रतिशत (0 से 100) |
| blendMode | string | No | `"over"` | कंपोज़िटिंग ब्लेंड मोड |

### Blend Modes {#blend-modes}

| Value | Description |
|-------|-------------|
| `over` | सामान्य ओवरले (डिफ़ॉल्ट) |
| `multiply` | पिक्सेल मानों को गुणा करके गहरा करना |
| `screen` | उलटकर, गुणा करके, और फिर उलटकर हल्का करना |
| `overlay` | आधार चमक के आधार पर multiply और screen को संयोजित करता है |
| `darken` | प्रत्येक परत से गहरे पिक्सेल को रखें |
| `lighten` | प्रत्येक परत से हल्के पिक्सेल को रखें |
| `hard-light` | तीव्र कंट्रास्ट ओवरले |
| `soft-light` | सूक्ष्म कंट्रास्ट ओवरले |
| `difference` | परतों के बीच पूर्ण अंतर |
| `exclusion` | difference के समान लेकिन कम कंट्रास्ट |

### File Fields {#file-fields}

| Field Name | Required | Description |
|------------|----------|-------------|
| file | Yes | आधार/पृष्ठभूमि छवि |
| overlay | Yes | ओवरले/अग्रभूमि छवि |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

multiply ब्लेंड मोड का उपयोग करते हुए:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notes {#notes}

- कंपोज़िटिंग से पहले दोनों छवियाँ मान्य और डिकोड की जाती हैं (HEIC, RAW, PSD, SVG समर्थित)।
- ओवरले `x` और `y` द्वारा निर्दिष्ट सटीक पिक्सेल निर्देशांक पर रखा जाता है। इसे फ़िट करने के लिए आकार नहीं बदला जाता।
- यदि अपारदर्शिता 100 से कम है, तो ब्लेंडिंग से पहले ओवरले पर एक अल्फा मास्क लागू किया जाता है।
- ओवरले आधार छवि की सीमाओं से आगे बढ़ सकता है (इसे क्लिप कर दिया जाएगा)।
- प्रोसेसिंग से पहले दोनों छवियों पर EXIF अभिविन्यास स्वचालित रूप से लागू किया जाता है।
- आउटपुट आयाम आधार छवि के आयाम से मेल खाते हैं।
