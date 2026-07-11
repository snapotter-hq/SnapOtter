---
description: "कई PDF को एक ही दस्तावेज़ में मिलाएं।"
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: e49ae485ff9a
---

# Merge PDFs {#merge-pdfs}

दो या अधिक PDF फ़ाइलों को एक ही दस्तावेज़ में मिलाएं, प्रत्येक इनपुट फ़ाइल के पृष्ठ क्रम को संरक्षित करते हुए।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

दो या अधिक PDF फ़ाइलों के साथ multipart form data स्वीकार करता है। कोई `settings` फ़ील्ड आवश्यक नहीं है।

## Parameters {#parameters}

इस टूल में कोई सेटिंग्स पैरामीटर नहीं हैं। बस दो या अधिक PDF फ़ाइलें अपलोड करें।

| Constraint | Value |
|------------|-------|
| न्यूनतम फ़ाइलें | 2 |
| अधिकतम फ़ाइलें | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- फ़ाइलें उसी क्रम में मिलाई जाती हैं जिस क्रम में वे अपलोड की जाती हैं।
- कम से कम दो PDF फ़ाइलें आवश्यक हैं; यदि इससे कम प्रदान की जाती हैं तो अनुरोध 400 त्रुटि के साथ विफल हो जाएगा।
- इनपुट फ़ाइलों की अधिकतम संख्या 20 है।
- मिलाने से पहले एन्क्रिप्टेड PDF को अनलॉक करना आवश्यक है।
