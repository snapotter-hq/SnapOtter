---
description: "एक स्पष्ट पृष्ठ क्रम के साथ PDF में पृष्ठों को पुनर्व्यवस्थित करें।"
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 022dbf667140
---

# Organize PDF {#organize-pdf}

वांछित पृष्ठ अनुक्रम निर्दिष्ट करके PDF में पृष्ठों को पुनर्व्यवस्थित करें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

एक PDF फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | qpdf सिंटैक्स में वांछित पृष्ठ क्रम, उदा. `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- पृष्ठ रेंज qpdf सिंटैक्स का उपयोग करती हैं: `3,1,2` पहले तीन पृष्ठों को पुनर्व्यवस्थित करता है, और `5-z` पृष्ठ 5 से अंतिम पृष्ठ तक जोड़ता है।
- पृष्ठों को एक से अधिक बार सूचीबद्ध करके डुप्लिकेट किया जा सकता है (उदा. `"1,1,2,3"` पृष्ठ 1 को डुप्लिकेट करता है)।
- ऑर्डर स्ट्रिंग में सूचीबद्ध नहीं किए गए पृष्ठ आउटपुट से छोड़ दिए जाते हैं।
