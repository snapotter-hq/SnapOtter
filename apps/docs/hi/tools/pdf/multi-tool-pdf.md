---
description: "अन्य PDF से पेजों को एक ही एडिटर में या API के माध्यम से पुनः व्यवस्थित करें, घुमाएँ, हटाएँ और खींचें।"
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 71bd51b14e33
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

एक स्पष्ट पेज योजना से PDF बनाएँ: पेजों को पुनः व्यवस्थित करें, डुप्लिकेट करें, घुमाएँ या हटाएँ, और अतिरिक्त PDF से पेज एक ही अनुरोध में खींचें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

एक या अधिक PDF फ़ाइलों और एक JSON `settings` फ़ील्ड के साथ multipart फ़ॉर्म डेटा स्वीकार करता है।
प्रति अनुरोध अधिकतम 20 इनपुट दस्तावेज़ और 1,200 आउटपुट पेज समर्थित हैं।

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | आउटपुट क्रम में आउटपुट पेज योजना। प्रत्येक आइटम `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }` है। `doc` अपलोड क्रम (0-आधारित) में अपलोड की गई फ़ाइलों को इंडेक्स करता है; `page` उस दस्तावेज़ में 1-आधारित पेज संख्या है। |
| pageCounts | array | Yes | प्रत्येक अपलोड किए गए दस्तावेज़ की वास्तविक पेज संख्या, उसी क्रम में। अपने दस्तावेज़ की संख्या से आगे की योजना पेज 400 के साथ अस्वीकार कर दिया जाता है। |

## Example Request {#example-request}

पहले दस्तावेज़ के पेज 3 और 1 लें, फिर दूसरे के पेज 1 और 2 लें, पहले आउटपुट पेज को 90° दक्षिणावर्त घुमाएँ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- एक ही पेज को डुप्लिकेट करने के लिए `items` में कई बार दिखाया जा सकता है।
- `items` में मौजूद न होने वाले पेज आउटपुट से हटा दिए जाते हैं।
- `rot` कॉपी किए गए पेज पर नया प्रदर्शन ओरिएंटेशन दर्ज करता है (मौजूदा रोटेशन के साथ संयोजित); पेज की सामग्री अपरिवर्तित रहती है।
- रोटेशन प्रत्येक आउटपुट कॉपी पर लागू होता है, इसलिए डुप्लिकेट के अलग-अलग रोटेशन हो सकते हैं।
- आउटपुट एक नया, सपाट दस्तावेज़ है; स्रोत बुकमार्क और दस्तावेज़-स्तरीय मेटाडेटा बनाए नहीं रखे जाते।
- प्रोसेसिंग के लिए qpdf बाइनरी आवश्यक है, जो आधिकारिक Docker इमेज में शामिल है।
