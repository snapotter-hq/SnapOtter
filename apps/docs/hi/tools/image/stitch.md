---
description: "संरेखण, गैप, बॉर्डर, और रीसाइज़ मोड पर नियंत्रण के साथ छवियों को अगल-बगल, स्टैक्ड, या ग्रिड में जोड़ें।"
i18n_source_hash: 670c5cc944b1
i18n_provenance: human
i18n_output_hash: 0b6117e2ecf1
---

# इमेज जोड़ें {#stitch-combine}

कई छवियों को अगल-बगल, लंबवत रूप से स्टैक्ड, या ग्रिड में व्यवस्थित करके जोड़ें। संरेखण, गैप, बॉर्डर, कॉर्नर रेडियस, और कई रीसाइज़ मोड का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/stitch`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| direction | string | No | `"horizontal"` | लेआउट दिशा: `horizontal`, `vertical`, `grid` |
| gridColumns | integer | No | 2 | जब दिशा `grid` हो तो स्तंभों की संख्या (2 से 100) |
| resizeMode | string | No | `"fit"` | छवियों का आकार कैसे बदला जाता है: `fit`, `original`, `stretch`, `crop` |
| alignment | string | No | `"center"` | क्रॉस-अक्ष संरेखण: `start`, `center`, `end` |
| gap | number | No | 0 | पिक्सेल में छवियों के बीच गैप (0 से 1000) |
| border | number | No | 0 | पिक्सेल में बाहरी बॉर्डर चौड़ाई (0 से 500) |
| cornerRadius | number | No | 0 | अंतिम आउटपुट पर लागू कॉर्नर रेडियस (0 से 500) |
| backgroundColor | string | No | `"#FFFFFF"` | हेक्स के रूप में बैकग्राउंड/बॉर्डर रंग (उदा. `#FF0000`) |
| format | string | No | `"png"` | आउटपुट फ़ॉर्मेट: `png`, `jpeg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | आउटपुट गुणवत्ता (1 से 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/stitch \
  -F "file=@image1.png" \
  -F "file=@image2.png" \
  -F "file=@image3.png" \
  -F 'settings={"direction":"horizontal","resizeMode":"fit","gap":10,"backgroundColor":"#FFFFFF","format":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/stitch.png",
  "originalSize": 1234567,
  "processedSize": 987654
}
```

## Notes {#notes}

- कम से कम 2 छवियों की आवश्यकता है। multipart अनुरोध में कई image फ़ाइलें अपलोड करें।
- HEIC, RAW, PSD, और SVG इनपुट फ़ॉर्मेट का समर्थन करता है (स्वचालित रूप से डिकोड)।
- रीसाइज़ मोड:
  - `fit` - जोड़ने वाली अक्ष के साथ सबसे छोटे आयाम से मिलान करने के लिए छवियों को स्केल करें।
  - `original` - मूल आकार रखें (असमान किनारे उत्पन्न कर सकता है)।
  - `stretch` - आस्पेक्ट रेशियो को बनाए रखे बिना छवियों को सबसे छोटे आयाम से मिलान करने के लिए बाध्य करें।
  - `crop` - सबसे छोटे आयाम से मिलान करने के लिए छवियों को कवर-क्रॉप करें।
- `grid` मोड में, कोशिकाओं को सभी छवियों के माध्यिका आयामों के अनुसार आकार दिया जाता है।
- `cornerRadius` पूरे अंतिम आउटपुट पर लागू होता है, न कि व्यक्तिगत छवियों पर।
- मेमोरी की थकावट को रोकने के लिए कैनवास आकार `MAX_CANVAS_PIXELS` सर्वर कॉन्फ़िगरेशन द्वारा सीमित है।
