---
description: "PDF के सभी रंगों को ग्रेस्केल में बदलें।"
i18n_source_hash: f327addb32d6
i18n_provenance: human
i18n_output_hash: d4ed853feb1a
---

# Grayscale PDF {#grayscale-pdf}

PDF के सभी रंगों को ग्रेस्केल में बदलें, जिससे दस्तावेज़ का एक श्वेत-श्याम संस्करण बने।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/grayscale-pdf`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है। कोई `settings` फ़ील्ड आवश्यक नहीं है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग्स पैरामीटर नहीं हैं। PDF फ़ाइल सीधे अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/grayscale-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- सभी कलर स्पेस (RGB, CMYK) को ग्रेस्केल में बदला जाता है, जिसमें एम्बेडेड इमेज, वेक्टर ग्राफ़िक्स और टेक्स्ट शामिल हैं।
- आउटपुट फ़ाइल अक्सर मूल से छोटी होती है क्योंकि ग्रेस्केल डेटा को प्रति पिक्सेल कम बाइट्स की आवश्यकता होती है।
