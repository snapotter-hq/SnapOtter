---
description: "टेम्पलेट्स या कस्टम इमेज, स्टाइल किए गए टेक्स्ट बॉक्स और फ़ॉन्ट विकल्पों के साथ मीम बनाएँ।"
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 08b1cfca4220
---

# Meme Generator {#meme-generator}

बिल्ट-इन टेम्पलेट्स या कस्टम इमेज का उपयोग करके मीम बनाएँ। क्लासिक मीम स्टाइलिंग (बोल्ड, आउटलाइन किया हुआ टेक्स्ट), कई लेआउट प्रीसेट और फ़ॉन्ट विकल्पों के साथ टेक्स्ट जोड़ें।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

इनमें से किसी को स्वीकार करता है:
- **Multipart form data** एक इमेज फ़ाइल और एक JSON `settings` फ़ील्ड के साथ (कस्टम इमेज मोड)
- **JSON body** एक `templateId` के साथ (टेम्पलेट मोड, किसी फ़ाइल अपलोड की आवश्यकता नहीं)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| templateId | string | No | - | बिल्ट-इन मीम टेम्पलेट ID। यदि प्रदान किया गया हो, तो किसी इमेज अपलोड की आवश्यकता नहीं |
| textLayout | string | No | `"top-bottom"` | टेक्स्ट बॉक्स लेआउट: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | No | `[]` | `id` और `text` फ़ील्ड वाले टेक्स्ट बॉक्स ऑब्जेक्ट्स की सरणी |
| fontFamily | string | No | `"anton"` | फ़ॉन्ट: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | No | auto | फ़ॉन्ट का आकार पिक्सेल में (8 से 200)। छोड़ दिए जाने पर स्वतः गणना की जाती है |
| textColor | string | No | `"#ffffff"` | टेक्स्ट फ़िल रंग |
| strokeColor | string | No | `"#000000"` | टेक्स्ट स्ट्रोक/आउटलाइन रंग |
| textAlign | string | No | `"center"` | टेक्स्ट संरेखण: `left`, `center`, `right` |
| allCaps | boolean | No | `true` | टेक्स्ट को अपरकेस में बदलें |

### Text Boxes {#text-boxes}

`textBoxes` सरणी में प्रत्येक प्रविष्टि में होना चाहिए:

| Field | Type | Description |
|-------|------|-------------|
| id | string | लेआउट से मेल खाने वाला बॉक्स पहचानकर्ता (उदा., `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | प्रदर्शित करने के लिए मीम टेक्स्ट |

### Text Layout Box IDs {#text-layout-box-ids}

| Layout | Available Box IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Example Request {#example-request}

टॉप और बॉटम टेक्स्ट के साथ कस्टम इमेज:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

बिल्ट-इन टेम्पलेट का उपयोग करते हुए (JSON body, कोई फ़ाइल अपलोड नहीं):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notes {#notes}

- या तो `templateId` या एक अपलोड की गई इमेज फ़ाइल आवश्यक है। दोनों प्रदान करने पर टेम्पलेट का उपयोग होता है।
- टेम्पलेट्स अपनी स्वयं की टेक्स्ट बॉक्स स्थितियाँ परिभाषित करते हैं; टेम्पलेट्स का उपयोग करते समय `textLayout` पैरामीटर को अनदेखा कर दिया जाता है।
- क्लासिक मीम लुक के लिए टेक्स्ट को स्ट्रोक आउटलाइन के साथ SVG के रूप में रेंडर किया जाता है।
- यदि स्पष्ट रूप से सेट न किया गया हो, तो फ़ॉन्ट का आकार टेक्स्ट बॉक्स में फ़िट करने के लिए स्वतः गणना किया जाता है।
- खाली टेक्स्ट बॉक्स छोड़ दिए जाते हैं (यदि सभी बॉक्स खाली हों तो कोई रेंडरिंग नहीं होती)।
- टेम्पलेट्स का उपयोग करते समय आउटपुट फ़ाइल नाम में टेम्पलेट ID शामिल होता है (उदा., `meme-drake.png`)।
- HEIC, RAW, PSD और SVG इनपुट प्रोसेसिंग से पहले स्वतः डिकोड किए जाते हैं।
