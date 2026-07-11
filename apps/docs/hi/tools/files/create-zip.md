---
description: "कई फ़ाइलों को एक ही ZIP संग्रह में बंडल करें।"
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: d72cfe4b312a
---

# Create ZIP {#create-zip}

किसी भी प्रकार की कई फ़ाइलों को एक ही ZIP संग्रह में बंडल करें। डुप्लिकेट फ़ाइल नाम स्वचालित रूप से डी-डुप्लिकेट किए जाते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

दो या अधिक फ़ाइलों के साथ multipart form data स्वीकार करता है। किसी settings फ़ील्ड की आवश्यकता नहीं है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। बंडल करने के लिए किसी भी प्रकार की 2-50 फ़ाइलें अपलोड करें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- 2 से 50 के बीच इनपुट फ़ाइलों की आवश्यकता है।
- किसी भी प्रकार की फ़ाइल स्वीकार की जाती है; इनपुट फ़ॉर्मेट पर कोई प्रतिबंध नहीं है।
- यदि कई फ़ाइलें एक ही नाम साझा करती हैं, तो उन्हें संख्यात्मक प्रत्ययों के साथ स्वचालित रूप से डी-डुप्लिकेट किया जाता है।
- आउटपुट संग्रह मानक ZIP संपीड़न (deflate) का उपयोग करता है।
