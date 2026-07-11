---
description: "एक PDF को Word दस्तावेज़ (DOCX) में बदलें।"
i18n_source_hash: be41b6b49f84
i18n_provenance: human
i18n_output_hash: e9aa31fe8111
---

# PDF to Word {#pdf-to-word}

एक टेक्स्ट-आधारित PDF को Word दस्तावेज़ (DOCX) में बदलें। चयन योग्य टेक्स्ट वाली PDF के लिए सबसे उपयुक्त; स्कैन किए गए पृष्ठों को पहले OCR की आवश्यकता होगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-word`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं हैं। एक PDF अपलोड करें और इसे DOCX में बदल दिया जाएगा।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-word \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

`202 Accepted` लौटाता है। `/api/v1/jobs/{jobId}/progress` पर SSE के माध्यम से प्रगति ट्रैक करें।

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- टेक्स्ट-आधारित PDF के साथ सबसे अच्छा काम करता है। स्कैन किए गए या केवल-इमेज पृष्ठ खाली या न्यूनतम आउटपुट देंगे; पहले एक टेक्स्ट लेयर जोड़ने के लिए [PDF OCR](./ocr-pdf) का उपयोग करें।
- कन्वर्ज़न सर्वर पर हेडलेस चलने वाले LibreOffice द्वारा नियंत्रित किया जाता है।
- जटिल लेआउट (मल्टी-कॉलम, ओवरलैपिंग एलिमेंट) पूरी तरह से कन्वर्ट नहीं हो सकते।
