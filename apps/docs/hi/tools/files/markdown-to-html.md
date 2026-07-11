---
description: "एक Markdown फ़ाइल को एक स्टैंडअलोन HTML पेज में कन्वर्ट करें।"
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: 78a9ebecf458
---

# Markdown to HTML {#markdown-to-html}

एक Markdown फ़ाइल को एक स्टैंडअलोन HTML पेज में कन्वर्ट करें। स्रोत में संदर्भित रिमोट इमेज आउटपुट में जैसी हैं वैसी ही छोड़ दी जाती हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

एक Markdown फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक Markdown फ़ाइल अपलोड करें और यह HTML में कन्वर्ट हो जाएगी।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.md`, `.markdown`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- आउटपुट इनलाइन स्टाइल के साथ एक स्व-निहित HTML पेज है।
- Markdown स्रोत में रिमोट इमेज URL जैसे हैं वैसे ही संरक्षित रहते हैं और नहीं लाए जाते।
