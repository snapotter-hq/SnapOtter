---
description: "फ़ॉन्ट को TTF, OTF, WOFF और WOFF2 के बीच रूपांतरित करें।"
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 45380f050e52
i18n_hash_version: 2
---

# फ़ॉन्ट कन्वर्ट {#convert-font}

किसी फ़ॉन्ट फ़ाइल को TrueType (TTF), OpenType CFF (OTF), WOFF और WOFF2 के बीच रूपांतरित करता है। इससे आप डेस्कटॉप फ़ॉन्ट को वेब फ़ॉन्ट बना सकते हैं, या ऐसे ऐप के लिए OTF से TTF निकाल सकते हैं जो केवल TrueType स्वीकार करता है।

## API एंडपॉइंट {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

`.ttf`, `.otf`, `.woff` या `.woff2` फ़ाइल और एक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## पैरामीटर {#parameters}

| पैरामीटर | प्रकार | आवश्यक | डिफ़ॉल्ट | विवरण |
|-----------|------|----------|---------|-------------|
| format | string | नहीं | `ttf` | आउटपुट फ़ॉर्मैट: `ttf`, `otf`, `woff` या `woff2` |

## उदाहरण अनुरोध {#example-request}

OTF से TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

वेब के लिए TTF से WOFF2:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## उदाहरण प्रतिक्रिया {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## टिप्पणियाँ {#notes}

- WOFF और WOFF2 उसी फ़ॉन्ट डेटा के संपीड़ित आवरण हैं, इसलिए इनमें या इनसे रूपांतरण करने पर आउटलाइन नहीं बदलतीं।
- OTF से TTF रूपांतरण क्यूबिक (CFF) कर्व को क्वाड्रैटिक TrueType कर्व में बदलता है। हर कर्व मूल से 1 फ़ॉन्ट यूनिट के भीतर रहता है, जो सामान्य आकारों में दिखाई नहीं देता, लेकिन यह रूपांतरण पूरी तरह उलटा नहीं जा सकता। TTF से OTF रूपांतरण कर्व के आकार बनाए रखता है और केवल कंट्रोल पॉइंट को पूर्ण फ़ॉन्ट यूनिट तक राउंड करता है।
- फ़ॉन्ट की एम्बेडिंग अनुमतियाँ (OS/2 `fsType` फ़ील्ड) जैसी हैं वैसी ही रहती हैं।
- फ़ॉन्ट कलेक्शन (`.ttc`) समर्थित नहीं हैं। वेरिएबल TrueType फ़ॉन्ट को OTF में और वेरिएबल CFF2 फ़ॉन्ट को TTF में नहीं बदला जा सकता; उन्हें इसके बजाय WOFF या WOFF2 में बदलें।
- रूपांतरण API प्रोसेस के भीतर नहीं, बल्कि Python डॉक्यूमेंट वर्कर में चलता है, और उसका टाइमआउट बाकी डॉक्यूमेंट टूल जितना ही है।
