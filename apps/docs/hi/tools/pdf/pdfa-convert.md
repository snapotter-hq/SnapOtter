---
description: "दीर्घकालिक संरक्षण के लिए एक PDF को आर्काइवल PDF/A-2 फ़ॉर्मेट में बदलें।"
i18n_source_hash: 4c6bf7a12e84
i18n_provenance: human
i18n_output_hash: 2a283e7010ee
---

# PDF/A Convert {#pdf-a-convert}

एक PDF को PDF/A-2 आर्काइवल फ़ॉर्मेट में बदलें, जो दीर्घकालिक संरक्षण और नियामक अनुपालन के लिए उपयुक्त है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdfa-convert`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है। कोई `settings` फ़ील्ड आवश्यक नहीं है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग्स पैरामीटर नहीं हैं। PDF फ़ाइल सीधे अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdfa-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2600000
}
```

## Notes {#notes}

- आउटपुट PDF/A-2 मानक के अनुरूप होता है।
- PDF/A सभी फ़ॉन्ट एम्बेड करता है और बाहरी संदर्भों की अनुमति नहीं देता, इसलिए आउटपुट फ़ाइल मूल से बड़ी हो सकती है।
- कन्वर्ज़न के दौरान एन्क्रिप्शन और JavaScript हटा दिए जाते हैं, क्योंकि PDF/A मानक द्वारा इनकी अनुमति नहीं है।
