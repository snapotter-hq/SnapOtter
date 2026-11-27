---
description: "त्रैराशिक हल करें, तीन ज्ञात मानों से X निकालें।"
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 7978ec216029
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

त्रैराशिक (क्रॉस-गुणन) हल करें। तीन मान टाइप करें, डायरेक्ट या इनवर्स चुनें, और चौथा मान पाएं। हर उत्तर के बाद मान फ़ॉर्म में बने रहते हैं, इसलिए आप एक संख्या बदलकर अगला प्रयास करने के लिए Enter दबा सकते हैं।

यह गणित का अनुपात हल करने वाला टूल है, रूल-ऑफ-थर्ड्स फ़ोटो कंपोज़िशन ग्रिड नहीं।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

multipart form data के बजाय JSON बॉडी स्वीकार करता है, और डाउनलोड के लिए फ़ाइल के बजाय एक संख्या लौटाता है।

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (आवश्यक) | पहला ज्ञात मान। |
| `b` | number | (आवश्यक) | वह मान जो `a` के साथ जाता है। |
| `c` | number | (आवश्यक) | तीसरा ज्ञात मान। X वह मान है जो इसके साथ जाता है। |
| `mode` | string | `direct` | `direct` या `inverse`। |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A का B से वही संबंध है जो C का X से | X = B × C ÷ A | 3 सेब की कीमत 6 है, तो 10 सेब की कीमत 20 होगी |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 मज़दूरों को 6 दिन लगते हैं, तो 8 मज़दूरों को 3 दिन लगेंगे |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- उत्तर को 15 सार्थक अंकों तक राउंड किया जाता है, इसलिए `0.1 × 3 ÷ 3` का नतीजा `0.1` आता है, `0.10000000000000002` नहीं।
- डायरेक्ट अनुपात में `a` का `0` होना और इनवर्स अनुपात में `c` का `0` होना संभव नहीं है, क्योंकि दोनों भाजक हैं। दोनों स्थितियों में 400 लौटता है।
- जो उत्तर double की सीमा से बाहर हो (लगभग `1.8e308` से ऊपर, या शून्य के इतना पास कि उसकी परिशुद्धता न बचे) वह 400 लौटाता है।
- वेब ऐप में आप `1,5` या `1.5` टाइप कर सकते हैं, और अरबी-इंडिक या देवनागरी अंक भी चलते हैं। हज़ार के विभाजक स्वीकार नहीं किए जाते।
