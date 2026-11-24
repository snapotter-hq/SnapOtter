---
description: "एक PDF को Markdown में बदलें; PDF में जहाँ हों, हेडिंग, सूचियाँ और टेबल बनाए रखें।"
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 7585e844f5dd
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

एक PDF को ऐसी Markdown फ़ाइल में बदलें जिसे आप विकी, स्टैटिक साइट या LLM पाइपलाइन में डाल सकें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

एक PDF फ़ाइल के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

इस टूल में कोई कॉन्फ़िगर करने योग्य पैरामीटर नहीं हैं। एक PDF अपलोड करें और बदले में `.md` फ़ाइल पाएँ।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

बड़े PDF में सिंक विंडो से ज़्यादा समय लग सकता है। तब API `202` के साथ जवाब देता है, जिसमें `jobId` होता है, और आप `/api/v1/jobs/{jobId}/progress` पर प्रगति ट्रैक करते हैं।

## क्या-क्या बना रहता है {#what-gets-kept}

PDF में संरचना नहीं, स्थिति के साथ रखा टेक्स्ट सहेजा जाता है, इसलिए कन्वर्टर संरचना का अनुमान लगाता है:

- **हेडिंग।** बॉडी टेक्स्ट से साफ़ तौर पर बड़े साइज़ में लिखी छोटी पंक्तियाँ `#` से `######` तक की हेडिंग बन जाती हैं, जिनका क्रम पूरे दस्तावेज़ में साइज़ के आधार पर तय होता है।
- **सूचियाँ।** बुलेट या संख्या से शुरू होने वाली पंक्तियाँ सूची आइटम बन जाती हैं।
- **बोल्ड, इटैलिक और लिंक।** इनलाइन बने रहते हैं। केवल `http`, `https` और `mailto` लिंक बचते हैं।
- **टेबल।** रूलिंग लाइनों से बनी टेबल Markdown टेबल के रूप में आती हैं। सिर्फ़ स्पेसिंग से बनी टेबल आमतौर पर सामान्य पैराग्राफ़ बनकर आती हैं।

इमेज हटा दी जाती हैं। मल्टी-कॉलम लेआउट और असामान्य पेज डिज़ाइन पर नतीजा सर्वोत्तम प्रयास भर होता है, इसलिए भरोसा करने से पहले आउटपुट जाँच लें।

## Notes {#notes}

- स्वीकृत इनपुट फ़ॉर्मेट: `.pdf`।
- रिस्पॉन्स में `chars` फ़ील्ड Markdown आउटपुट की लंबाई है।
- स्कैन किए गए PDF में कन्वर्ट करने के लिए टेक्स्ट लेयर नहीं होती। टूल खाली फ़ाइल लौटाने के बजाय उसे `422` और कोड `NO_TEXT_LAYER` के साथ अस्वीकार कर देता है। ऐसे PDF के लिए [PDF OCR](./ocr-pdf) टूल का उपयोग करें।
- उल्टी दिशा में बदलने के लिए [Markdown से PDF](../files/markdown-to-pdf), [Markdown से DOCX](../files/markdown-to-docx) और [Markdown से HTML](../files/markdown-to-html) `.md` फ़ाइलें पढ़ते हैं।
