---
description: "फ़ॉर्म और एनोटेशन को पृष्ठ सामग्री में बेक करें।"
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: f1996c4948a4
---

# Flatten PDF {#flatten-pdf}

इंटरैक्टिव फ़ॉर्म फ़ील्ड और एनोटेशन को पृष्ठ सामग्री में बेक करें, जिससे एक स्थिर PDF बने जो हर जगह एक जैसा दिखे।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं हैं। एक PDF अपलोड करें और सभी फ़ॉर्म और एनोटेशन फ़्लैट कर दिए जाएंगे।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- फ़ॉर्म फ़ील्ड मान आउटपुट में स्थिर टेक्स्ट के रूप में संरक्षित रहते हैं।
- एनोटेशन (टिप्पणियाँ, हाइलाइट, स्टिकी नोट्स) पृष्ठ सामग्री का हिस्सा बन जाते हैं और उन्हें अब संपादित नहीं किया जा सकता।
