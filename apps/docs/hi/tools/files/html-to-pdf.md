---
description: "एक HTML फ़ाइल को PDF में कन्वर्ट करें।"
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: f529bf08fb37
---

# HTML to PDF {#html-to-pdf}

एक HTML फ़ाइल को एक स्टाइल किए गए PDF दस्तावेज़ में कन्वर्ट करें। गोपनीयता के लिए रिमोट संसाधन (बाहरी इमेज, स्टाइलशीट, स्क्रिप्ट) अक्षम कर दिए जाते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

एक HTML फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक HTML फ़ाइल अपलोड करें और यह PDF में कन्वर्ट हो जाएगी।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति को ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.html`, `.htm`।
- गोपनीयता और सुरक्षा के लिए रिमोट संसाधन (URL के माध्यम से संदर्भित इमेज, स्टाइलशीट, स्क्रिप्ट) नहीं लाए जाते।
- इनलाइन स्टाइल और एम्बेड की गई इमेज (data URIs) संरक्षित रहती हैं।
- कन्वर्ज़न सर्वर पर WeasyPrint द्वारा नियंत्रित किया जाता है।
