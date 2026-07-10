---
description: "एक Markdown फ़ाइल को Word दस्तावेज़ (DOCX) में कन्वर्ट करें।"
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: e7d5cf531013
---

# Markdown to Word {#markdown-to-word}

एक Markdown फ़ाइल को Word दस्तावेज़ (DOCX) में कन्वर्ट करें, हेडिंग, सूचियाँ, कोड ब्लॉक, और अन्य फ़ॉर्मेटिंग को संरक्षित करते हुए।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

एक Markdown फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक Markdown फ़ाइल अपलोड करें और यह DOCX में कन्वर्ट हो जाएगी।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.md`, `.markdown`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- हेडिंग, bold, italic, लिंक, कोड ब्लॉक, और सूचियाँ Word शैलियों में मैप की जाती हैं।
- कन्वर्ज़न सर्वर पर Pandoc द्वारा नियंत्रित किया जाता है।
