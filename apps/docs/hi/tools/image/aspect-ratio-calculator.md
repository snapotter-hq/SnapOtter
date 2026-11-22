---
description: "आस्पेक्ट रेशियो बनाए रखने वाली छूटी हुई चौड़ाई या ऊँचाई निकालें, और रेशियो को सरल रूप में लिखें।"
i18n_source_hash: 2f975049563e
i18n_provenance: machine
i18n_output_hash: 90f3be9eb47a
i18n_hash_version: 2
---

# आस्पेक्ट रेशियो कैलकुलेटर {#aspect-ratio-calculator}

मूल चौड़ाई और ऊँचाई दर्ज करें, फिर नई चौड़ाई या नई ऊँचाई दें, और दूसरी भुजा वापस पाएँ ताकि अनुपात वही रहे। रेशियो सबसे सरल रूप में लौटता है, इसलिए 1920 × 1080 का मान 16:9 होता है। वेब ऐप में आप किसी सामान्य रेशियो (16:9, 4:3, 3:2, 1:1, 21:9, 9:16, 4:5) से शुरू कर सकते हैं और लैंडस्केप तथा पोर्ट्रेट के बीच बदल सकते हैं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/aspect-ratio-calculator`

multipart form data नहीं, बल्कि एक JSON बॉडी स्वीकार करता है, और डाउनलोड करने के लिए फ़ाइल की जगह संख्याएँ लौटाता है।

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | number | (required) | मूल चौड़ाई। |
| `height` | number | (required) | मूल ऊँचाई। |
| `newWidth` | number | - | लक्ष्य चौड़ाई। रिस्पॉन्स इससे `newHeight` निकालता है। |
| `newHeight` | number | - | लक्ष्य ऊँचाई। रिस्पॉन्स इससे `newWidth` निकालता है। |
| `round` | boolean | `true` | निकाली गई भुजा को पूर्ण संख्या में राउंड करें। `false` होने पर यह दो दशमलव स्थान रखता है। |

हर आयाम `0.0001` और `1000000` के बीच होना चाहिए। `newWidth` या `newHeight` भेजें, दोनों नहीं। केवल सरलीकृत रेशियो पाने के लिए दोनों छोड़ दें।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/aspect-ratio-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"width": 1920, "height": 1080, "newWidth": 1280}'
```

## Example Response {#example-response}

```json
{
  "width": 1920,
  "height": 1080,
  "ratio": "16:9",
  "ratioDecimal": 1.7778,
  "newWidth": 1280,
  "newHeight": 720
}
```

अनुरोध में दोनों में से कोई न भेजा गया हो तो `newWidth` और `newHeight` का मान `null` होता है।

## Notes {#notes}

- भिन्नात्मक आकारों को चार दशमलव स्थान तक लेकर पूर्ण संख्या वाले रेशियो में घटाया जाता है, इसलिए `8.5` × `11` का परिणाम `17:22` आता है।
- `ratioDecimal` चौड़ाई को ऊँचाई से भाग देने पर मिलता है, जिसे चार दशमलव स्थान तक राउंड किया जाता है।
- निकाली गई भुजा कभी `0` नहीं लौटती। राउंडिंग चालू होने पर यह कम से कम `1` होती है, और बंद होने पर कम से कम `0.01`।
- `newWidth` और `newHeight` दोनों भेजने पर, या अनुमत सीमा से बाहर का आयाम भेजने पर 400 लौटता है।
- कैलकुलेटर कभी कोई फ़ाइल नहीं पढ़ता या लिखता। इन संख्याओं को लागू करने के लिए [इमेज रीसाइज़](/hi/tools/image/resize) या [इमेज क्रॉप](/hi/tools/image/crop) का उपयोग करें।
