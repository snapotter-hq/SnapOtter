---
description: "एक छवि को पंक्तियों और स्तंभों द्वारा या पिक्सेल आकार द्वारा ग्रिड टाइलों में विभाजित करें, जिसे ZIP आर्काइव के रूप में लौटाया जाता है।"
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 3c6671378498
---

# इमेज स्प्लिट {#image-splitting}

एक अकेली छवि को स्तंभ/पंक्ति गणना द्वारा या विशिष्ट पिक्सेल आयामों द्वारा ग्रिड टाइलों में विभाजित करें। सभी टाइलों वाला एक ZIP आर्काइव लौटाता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/split`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| columns | integer | No | 3 | विभाजित करने के लिए स्तंभों की संख्या (1 से 100) |
| rows | integer | No | 3 | विभाजित करने के लिए पंक्तियों की संख्या (1 से 100) |
| tileWidth | integer | No | - | पिक्सेल में टाइल चौड़ाई (न्यूनतम 10)। जब `tileWidth` और `tileHeight` दोनों सेट हों तो `columns` को ओवरराइड करता है। |
| tileHeight | integer | No | - | पिक्सेल में टाइल ऊँचाई (न्यूनतम 10)। जब `tileWidth` और `tileHeight` दोनों सेट हों तो `rows` को ओवरराइड करता है। |
| outputFormat | string | No | `"original"` | टाइलों के लिए आउटपुट फ़ॉर्मेट: `original`, `png`, `jpg`, `webp`, `avif`, `jxl` |
| quality | number | No | 90 | लॉसी फ़ॉर्मेट के लिए आउटपुट गुणवत्ता (1 से 100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## Example Response {#example-response}

प्रतिक्रिया `Content-Type: application/zip` के साथ सीधे एक ZIP फ़ाइल के रूप में स्ट्रीम की जाती है। फ़ाइल नाम `split-<jobId>.zip` पैटर्न का अनुसरण करता है।

ZIP के अंदर प्रत्येक टाइल का नाम `<originalBaseName>_r<row>_c<col>.<ext>` है (उदा. `photo_r1_c1.png`, `photo_r2_c3.webp`)।

## Notes {#notes}

- एक अकेली छवि फ़ाइल स्वीकार करता है।
- HEIC, RAW, PSD, और SVG इनपुट फ़ॉर्मेट का समर्थन करता है (स्वचालित रूप से डिकोड)।
- जब `tileWidth` और `tileHeight` दोनों प्रदान किए जाते हैं, तो वे `columns`/`rows` पर प्राथमिकता लेते हैं। ग्रिड आयामों की गणना `ceil(imageWidth / tileWidth)` और `ceil(imageHeight / tileHeight)` के रूप में की जाती है।
- यदि छवि के आयाम समान रूप से विभाज्य नहीं हैं तो किनारे की टाइलें (सबसे दाहिना स्तंभ, नीचे की पंक्ति) निर्दिष्ट टाइल आकार से छोटी हो सकती हैं।
- अधिकतम ग्रिड आकार 100x100 (10,000 टाइलें) पर सीमित है।
- प्रतिक्रिया सीधे ZIP को स्ट्रीम करती है, इसलिए कोई JSON प्रतिक्रिया बॉडी नहीं है। फ़ाइल सहेजने के लिए curl के साथ `--output` का उपयोग करें।
