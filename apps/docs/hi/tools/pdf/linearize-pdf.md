---
description: "तेज़ वेब व्यूइंग (प्रोग्रेसिव डाउनलोड) के लिए PDF को लीनियराइज़ करें।"
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: cdb0c0ae2c33
---

# Web-Optimize PDF {#web-optimize-pdf}

एक PDF को लीनियराइज़ करें ताकि पूरी फ़ाइल की प्रतीक्षा किए बिना उसे वेब ब्राउज़र में प्रोग्रेसिव रूप से डाउनलोड और प्रदर्शित किया जा सके।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है। कोई `settings` फ़ील्ड आवश्यक नहीं है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग्स पैरामीटर नहीं हैं। PDF फ़ाइल सीधे अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- लीनियराइज़ेशन PDF की आंतरिक संरचना को पुनर्व्यवस्थित करता है ताकि पूरी फ़ाइल डाउनलोड होने से पहले पहला पृष्ठ रेंडर हो सके।
- जोड़े गए लीनियराइज़ेशन डेटा के कारण आउटपुट फ़ाइल इनपुट से थोड़ी बड़ी हो सकती है।
- पहले से लीनियराइज़्ड PDF को बिना किसी समस्या के फिर से लीनियराइज़ किया जाता है।
