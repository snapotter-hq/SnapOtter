---
description: "YAML और JSON के बीच दोनों दिशाओं में रूपांतरण करें।"
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: e30ee2c9fb6f
---

# YAML / JSON {#yaml-json}

YAML और JSON प्रारूपों के बीच दोनों दिशाओं में रूपांतरण करें। JSON पाने के लिए एक YAML फ़ाइल अपलोड करें, या YAML पाने के लिए एक JSON फ़ाइल अपलोड करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

एक YAML या JSON फ़ाइल के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। रूपांतरण की दिशा इनपुट फ़ाइल के एक्सटेंशन से निर्धारित होती है।

## Example Request {#example-request}

YAML to JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON to YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Notes {#notes}

- रूपांतरण की दिशा इनपुट फ़ाइल के एक्सटेंशन से स्वतः पता लगाई जाती है: `.yaml` या `.yml` से `.json` बनता है, और `.json` से `.yaml` बनता है।
- `.yaml` और `.yml` दोनों एक्सटेंशन स्वीकार किए जाते हैं।
- मल्टी-डॉक्यूमेंट YAML फ़ाइल में केवल पहला दस्तावेज़ बदला जाता है; `---` द्वारा अलग किए गए अतिरिक्त दस्तावेज़ों को अनदेखा कर दिया जाता है।
