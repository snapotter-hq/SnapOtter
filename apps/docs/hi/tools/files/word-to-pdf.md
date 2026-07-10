---
description: "Word दस्तावेज़ों को PDF में बदलें।"
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 5718b01eb261
---

# Word to PDF {#word-to-pdf}

Word दस्तावेज़, OpenDocument टेक्स्ट, RTF, या सादा टेक्स्ट फ़ाइलों को PDF में बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

एक Word/ODT/RTF/TXT फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक दस्तावेज़ अपलोड करें और इसे PDF में बदल दिया जाएगा।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के ज़रिए प्रगति ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट प्रारूप: `.docx`, `.doc`, `.odt`, `.rtf`, `.txt`।
- रूपांतरण सर्वर पर headless चल रहे LibreOffice द्वारा संभाला जाता है।
- दस्तावेज़ में एम्बेड किए गए फ़ॉन्ट उपलब्ध होने पर उपयोग किए जाते हैं; अन्यथा सिस्टम फ़ॉन्ट प्रतिस्थापित किए जाते हैं।
- हेडर, फ़ुटर, तालिकाएँ, और छवियाँ PDF आउटपुट में संरक्षित रहती हैं।
