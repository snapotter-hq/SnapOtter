---
description: "एक क्षतिग्रस्त या भ्रष्ट PDF की मरम्मत करने का प्रयास करें।"
i18n_source_hash: 864073a2f09f
i18n_provenance: human
i18n_output_hash: af374dd84719
---

# Repair PDF {#repair-pdf}

एक क्षतिग्रस्त या भ्रष्ट PDF की आंतरिक संरचना को पुनर्निर्मित करके मरम्मत करने का प्रयास करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/repair-pdf`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है। कोई `settings` फ़ील्ड आवश्यक नहीं है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग्स पैरामीटर नहीं हैं। क्षतिग्रस्त PDF फ़ाइल सीधे अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/repair-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@damaged.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/damaged.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Notes {#notes}

- खराब फ़ॉर्मेट वाली फ़ाइलों को अंदर आने देने के लिए इनपुट पर संरचनात्मक सत्यापन छोड़ दिया जाता है।
- मरम्मत सर्वोत्तम-प्रयास है; गंभीर रूप से भ्रष्ट फ़ाइलें पूरी तरह से पुनर्प्राप्त नहीं हो सकतीं।
- पुनर्निर्मित क्रॉस-रेफ़रेंस तालिकाओं के कारण मरम्मत की गई PDF का आकार मूल से थोड़ा भिन्न हो सकता है।
