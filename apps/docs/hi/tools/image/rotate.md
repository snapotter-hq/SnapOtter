---
description: "इमेज को किसी भी कोण पर घुमाएँ और क्षैतिज या ऊर्ध्वाधर रूप से फ़्लिप करें।"
i18n_source_hash: c4ed5f7e270b
i18n_provenance: human
i18n_output_hash: 8321b92c9aab
---

# इमेज रोटेट और फ्लिप {#rotate-flip}

इमेज को एक मनमाने कोण पर घुमाएँ और/या उन्हें क्षैतिज या ऊर्ध्वाधर रूप से फ़्लिप करें। रोटेशन और फ़्लिप ऑपरेशन को एक ही अनुरोध में संयोजित किया जा सकता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/rotate`

एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | `0` | डिग्री में रोटेशन कोण (दक्षिणावर्त)। किसी भी संख्यात्मक मान को स्वीकार करता है। |
| horizontal | boolean | No | `false` | इमेज को क्षैतिज रूप से फ़्लिप करें (मिरर) |
| vertical | boolean | No | `false` | इमेज को ऊर्ध्वाधर रूप से फ़्लिप करें |

## Example Request {#example-request}

90 डिग्री दक्षिणावर्त घुमाएँ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 90}'
```

क्षैतिज रूप से फ़्लिप करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"horizontal": true}'
```

एक साथ घुमाएँ और फ़्लिप करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/rotate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"angle": 45, "vertical": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Notes {#notes}

- पहले रोटेशन लागू होता है, फिर फ़्लिप ऑपरेशन।
- गैर-90-डिग्री रोटेशन (उदा. 45 डिग्री) घुमाई गई इमेज को फ़िट करने के लिए कैनवास को बड़ा कर देंगे, जिसमें आउटपुट प्रारूप के आधार पर पारदर्शी या काला फ़िल होगा।
- सामान्य मान: क्वार्टर-टर्न रोटेशन के लिए 90, 180, 270।
- प्रोसेसिंग से पहले EXIF अभिविन्यास स्वतः लागू होता है, इसलिए रोटेशन दृश्य अभिविन्यास के सापेक्ष होता है।
