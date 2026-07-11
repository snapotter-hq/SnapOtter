---
description: "श्वेत-श्याम (potrace) और पूर्ण-रंगीन मल्टी-लेयर वेक्टराइज़ेशन के साथ रास्टर छवियों को SVG में बदलें।"
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 9d966cbf2872
---

# Image to SVG {#image-to-svg}

ट्रेसिंग एल्गोरिदम का उपयोग करके रास्टर छवियों को SVG में वेक्टराइज़ करें। श्वेत-श्याम ट्रेसिंग (potrace) और पूर्ण-रंगीन मल्टी-लेयर वेक्टराइज़ेशन का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colorMode | string | No | `"bw"` | ट्रेसिंग मोड: `bw` (श्वेत और श्याम) या `color` (मल्टी-कलर लेयर) |
| threshold | number | No | 128 | B&W मोड के लिए चमक थ्रेशोल्ड (0 से 255)। इससे नीचे के पिक्सेल काले हो जाते हैं। |
| colorPrecision | number | No | 6 | कलर मोड के लिए कलर क्वांटाइज़ेशन परिशुद्धता (1 से 16)। उच्च मान अधिक विशिष्ट कलर लेयर उत्पन्न करते हैं। |
| layerDifference | number | No | 6 | कलर मोड में लेयर के बीच न्यूनतम कलर अंतर (1 से 128) |
| filterSpeckle | number | No | 4 | पिक्सेल में ट्रेस किए गए आकारों के लिए न्यूनतम क्षेत्रफल (1 से 256)। शोर/धब्बे हटाता है। |
| pathMode | string | No | `"spline"` | पथ स्मूदिंग: `none` (दांतेदार), `polygon` (सीधे खंड), `spline` (स्मूद वक्र) |
| cornerThreshold | number | No | 60 | कलर मोड में कॉर्नर डिटेक्शन के लिए कोण थ्रेशोल्ड (0 से 180 डिग्री) |
| invert | boolean | No | `false` | ट्रेसिंग से पहले छवि को उलटें (काला/सफ़ेद अदला-बदली) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Color Vectorization {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notes {#notes}

- इनपुट फ़ॉर्मेट की परवाह किए बिना आउटपुट हमेशा एक SVG फ़ाइल होता है।
- HEIC, RAW, PSD, और SVG इनपुट फ़ॉर्मेट का समर्थन करता है (ट्रेसिंग से पहले स्वचालित रूप से रास्टर में डिकोड किया जाता है)।
- B&W मोड potrace एल्गोरिदम का उपयोग करता है। छवि को पहले ग्रेस्केल में बदला जाता है, फिर ट्रेसिंग से पहले शुद्ध काले/सफ़ेद में थ्रेशोल्ड किया जाता है।
- कलर मोड एक मल्टी-लेयर दृष्टिकोण का उपयोग करता है: छवि को कलर लेयर में क्वांटाइज़ किया जाता है, प्रत्येक को अलग से ट्रेस किया जाता है और SVG आउटपुट में स्टैक किया जाता है।
- कम `filterSpeckle` मान अधिक विवरण संरक्षित करते हैं लेकिन अधिक पथों के साथ बड़ी SVG फ़ाइलें उत्पन्न करते हैं।
- `pathMode` सेटिंग फ़ाइल आकार को महत्वपूर्ण रूप से प्रभावित करती है: `none` सबसे अधिक पथ उत्पन्न करता है, `spline` सबसे स्मूद (और आमतौर पर सबसे छोटा) आउटपुट उत्पन्न करता है।
- लोगो और आइकन के साथ सर्वोत्तम परिणामों के लिए, स्वच्छ हाई-कॉन्ट्रास्ट इनपुट के साथ B&W मोड का उपयोग करें। फ़ोटोग्राफ़ या चित्रण के लिए, उच्च `colorPrecision` के साथ कलर मोड का उपयोग करें।
