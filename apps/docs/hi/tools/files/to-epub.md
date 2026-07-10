---
description: "Word, Markdown, HTML, या सादा टेक्स्ट फ़ाइलों को EPUB में बदलें।"
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: cca6afef565a
---

# Convert to EPUB {#convert-to-epub}

Word दस्तावेज़, Markdown, HTML, या सादा टेक्स्ट फ़ाइलों को EPUB ई-बुक प्रारूप में बदलें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

एक Word/Markdown/HTML/TXT फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक दस्तावेज़ अपलोड करें और इसे EPUB में बदल दिया जाएगा।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- स्वीकृत इनपुट प्रारूप: `.docx`, `.md`, `.html`, `.txt`।
- EPUB आउटपुट EPUB 3 विनिर्देश का पालन करता है।
- स्रोत दस्तावेज़ के शीर्षकों का उपयोग सामग्री तालिका बनाने के लिए किया जाता है।
- रूपांतरण सर्वर पर Pandoc द्वारा संभाला जाता है।
