---
description: "PDF से सादा टेक्स्ट निकालें।"
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: dd2a9fba725c
---

# PDF to Text {#pdf-to-text}

एक PDF दस्तावेज़ से सभी पठनीय सादा टेक्स्ट को एक टेक्स्ट फ़ाइल में निकालें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं हैं। एक PDF अपलोड करें और उसकी टेक्स्ट सामग्री निकाली जाएगी।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- यह एक फ़ास्ट (सिंक्रोनस) टूल है जो परिणाम सीधे लौटाता है।
- रिस्पॉन्स में `chars` फ़ील्ड निकाले गए अक्षरों की संख्या दर्शाता है।
- केवल डिजिटल रूप से एम्बेडेड टेक्स्ट निकाला जाता है। स्कैन किए गए दस्तावेज़ों या इमेज-आधारित PDF के लिए, इसके बजाय [PDF OCR](./ocr-pdf) टूल का उपयोग करें।
