---
description: "JSON और XML के बीच, दोनों दिशाओं में कन्वर्ट करें।"
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: 762825d025ab
---

# JSON to XML {#json-to-xml}

JSON और XML फ़ॉर्मेट के बीच दोनों दिशाओं में कन्वर्ट करें। XML पाने के लिए एक JSON फ़ाइल अपलोड करें, या JSON पाने के लिए एक XML फ़ाइल अपलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

एक JSON या XML फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pretty | boolean | No | `true` | इंडेंटेशन के साथ आउटपुट को Pretty-print करें |

## Example Request {#example-request}

JSON to XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notes {#notes}

- कन्वर्ज़न दिशा इनपुट फ़ाइल एक्सटेंशन से स्वतः पहचानी जाती है: `.json` `.xml` उत्पन्न करता है, और `.xml` `.json` उत्पन्न करता है।
- `pretty` पैरामीटर दोनों दिशाओं पर लागू होता है। जब `false` होता है, तो आउटपुट बिना इंडेंटेशन के कॉम्पैक्ट होता है।
- round-trip कन्वर्ज़न के दौरान XML विशेषताएं और नेस्टेड संरचनाएं जहां संभव हो संरक्षित रहती हैं।
