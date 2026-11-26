---
description: "svgo से SVG फ़ाइलों को छोटा करें और नतीजे को वेक्टर SVG ही रखें, प्रिसिज़न, मल्टीपास, मेटाडेटा और फ़ॉर्मेटिंग के नियंत्रण के साथ।"
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: b63b5cef61db
i18n_hash_version: 2
---

# SVG ऑप्टिमाइज़ {#optimize-svg}

एडिटर के बचे हुए डेटा, फ़ालतू एट्रिब्यूट और अतिरिक्त दशमलव अंक हटाकर SVG फ़ाइलें छोटी करें, और नतीजा SVG के रूप में डाउनलोड करें। "वेब के लिए ऑप्टिमाइज़" के उलट, आउटपुट कभी रैस्टर नहीं किया जाता।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

`.svg` या `.svgz` फ़ाइल और JSON `settings` फ़ील्ड वाला मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | पाथ डेटा और संख्याओं में रखे जाने वाले दशमलव अंक (0 से 8)। कम मान से फ़ाइल छोटी होती है और कर्व थोड़े खुरदरे होते हैं। |
| multipass | boolean | No | `true` | जब तक आउटपुट छोटा होना बंद न हो, ऑप्टिमाइज़र को बार-बार चलाएँ |
| removeMetadata | boolean | No | `true` | टिप्पणियाँ, `<metadata>`, `<desc>` और एडिटर-विशिष्ट डेटा हटाएँ। इन्हें रखने के लिए इसे बंद करें। |
| pretty | boolean | No | `false` | आउटपुट को कुछ पंक्तियों में समेटने के बजाय पढ़ने में आसान बनाने के लिए इंडेंट करें |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- इनपुट SVG या SVGZ फ़ाइल होनी चाहिए। रैस्टर इमेज को `400` और कोड `IMAGE_UNDECODABLE` के साथ अस्वीकार कर दिया जाता है।
- `.svgz` इनपुट पहले खोला जाता है, और आउटपुट हमेशा सामान्य `.svg` होता है।
- खोलने के बाद SVG की सीमा 2 MB है। इससे बड़ी फ़ाइल को `400` और कोड `SVG_TOO_LARGE` के साथ अस्वीकार कर दिया जाता है।
- `viewBox` और `<title>` हमेशा रखे जाते हैं, इसलिए ग्राफ़िक अब भी स्केल होता है और उसका एक्सेसिबल नाम बना रहता है।
- इनपुट और आउटपुट दोनों SVG सैनिटाइज़र से गुज़रते हैं, जो स्क्रिप्ट और अन्य सक्रिय सामग्री हटा देता है।
- पाथ-भारी आर्टवर्क में `precision` घटाने से सबसे ज़्यादा जगह बचती है। 0 से 2 पर नतीजा आँखों से जाँच लें।
