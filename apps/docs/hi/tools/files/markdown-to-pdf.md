---
description: "किसी Markdown फ़ाइल को स्टाइल किए गए PDF में बदलें।"
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 07de9e798d9a
---

# Markdown to PDF {#markdown-to-pdf}

किसी Markdown फ़ाइल को स्टाइल किए गए PDF दस्तावेज़ में बदलें। गोपनीयता के लिए रिमोट संसाधन अक्षम रहते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

एक Markdown फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं है। एक Markdown फ़ाइल अपलोड करें और इसे PDF में बदल दिया जाएगा।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
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

- स्वीकृत इनपुट प्रारूप: `.md`, `.markdown`।
- गोपनीयता और सुरक्षा के लिए रिमोट संसाधन (URL के ज़रिए संदर्भित छवियाँ, स्टाइलशीट) फ़ेच नहीं किए जाते।
- Markdown को पहले HTML में रेंडर किया जाता है, फिर WeasyPrint के ज़रिए PDF में बदला जाता है।
- कोड ब्लॉक, तालिकाएँ, और अन्य Markdown तत्व PDF आउटपुट में स्टाइल किए जाते हैं।
