---
description: "सादे स्क्रीनशॉट को ग्रेडिएंट पृष्ठभूमि, डिवाइस फ़्रेम, छाया, और सोशल मीडिया साइज़िंग के साथ परिष्कृत छवियों में बदलें।"
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: fa158e10fa0c
---

# Beautify Screenshot {#beautify-screenshot}

स्क्रीनशॉट में ग्रेडिएंट पृष्ठभूमि, डिवाइस फ़्रेम, छाया, वॉटरमार्क, और सोशल मीडिया साइज़िंग जोड़ें। उत्पाद मार्केटिंग, सोशल मीडिया, और दस्तावेज़ीकरण के लिए परिष्कृत छवियाँ बनाने हेतु आदर्श।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | No | `"linear-gradient"` | पृष्ठभूमि प्रकार: `solid`, `linear-gradient`, `radial-gradient`, `image`, `transparent` |
| backgroundColor | string | No | `"#667eea"` | ठोस पृष्ठभूमि रंग (जब `backgroundType` `solid` हो तब उपयोग किया जाता है) |
| gradientStops | array | No | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | ग्रेडिएंट रंग स्टॉप (न्यूनतम 2)। प्रत्येक स्टॉप में `color` (hex) और `position` (0-100) होता है। |
| gradientAngle | number | No | 135 | डिग्री में ग्रेडिएंट कोण (0 से 360) |
| padding | number | No | 64 | पिक्सेल में छवि के चारों ओर पैडिंग (0 से 256) |
| borderRadius | number | No | 12 | स्क्रीनशॉट पर कॉर्नर त्रिज्या (0 से 64) |
| shadowPreset | string | No | `"subtle"` | छाया प्रीसेट: `none`, `subtle`, `medium`, `dramatic`, `custom` |
| shadowBlur | number | No | 20 | कस्टम छाया ब्लर त्रिज्या (0 से 100, जब `shadowPreset` `custom` हो तब उपयोग किया जाता है) |
| shadowOffsetX | number | No | 0 | कस्टम छाया क्षैतिज ऑफसेट (-50 से 50) |
| shadowOffsetY | number | No | 10 | कस्टम छाया ऊर्ध्वाधर ऑफसेट (-50 से 50) |
| shadowColor | string | No | `"#000000"` | hex के रूप में कस्टम छाया रंग |
| shadowOpacity | number | No | 30 | कस्टम छाया अपारदर्शिता (0 से 100) |
| frame | string | No | `"none"` | डिवाइस या विंडो फ़्रेम: `none`, `macos-light`, `macos-dark`, `windows-light`, `windows-dark`, `browser-light`, `browser-dark`, `iphone`, `iphone-dark`, `macbook`, `macbook-dark`, `ipad`, `ipad-dark` |
| frameTitle | string | No | - | विंडो फ़्रेम टाइटल बार में प्रदर्शित टाइटल टेक्स्ट |
| socialPreset | string | No | `"none"` | सोशल मीडिया आयामों में आकार बदलें: `none`, `twitter`, `linkedin`, `instagram-square`, `instagram-story`, `facebook`, `producthunt` |
| watermarkText | string | No | - | वैकल्पिक वॉटरमार्क टेक्स्ट ओवरले |
| watermarkPosition | string | No | `"bottom-right"` | वॉटरमार्क स्थिति: `top-left`, `top-right`, `bottom-left`, `bottom-right`, `center` |
| watermarkOpacity | number | No | 50 | वॉटरमार्क अपारदर्शिता (0 से 100) |
| outputFormat | string | No | `"png"` | आउटपुट प्रारूप: `png`, `jpeg`, `webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- दो फ़ाइल फ़ील्ड स्वीकार करता है: `file` (आवश्यक, मुख्य स्क्रीनशॉट) और `backgroundImage` (वैकल्पिक, जब `backgroundType` `image` हो तब उपयोग किया जाता है)।
- HEIC, RAW, PSD, और SVG इनपुट प्रारूपों का समर्थन करता है (स्वचालित रूप से डिकोड किए गए)।
- छाया प्रीसेट विशिष्ट मानों से मैप होते हैं:
  - `subtle`: blur 20, offsetY 4, opacity 20%
  - `medium`: blur 40, offsetY 10, opacity 35%
  - `dramatic`: blur 80, offsetY 20, opacity 50%
- सोशल मीडिया प्रीसेट `contain` मोड का उपयोग करके अंतिम आउटपुट को लक्ष्य आयामों में फ़िट करने के लिए आकार बदलते हैं:
  - `twitter`: 1600x900
  - `linkedin`: 1200x627
  - `instagram-square`: 1080x1080
  - `instagram-story`: 1080x1920
  - `facebook`: 1200x630
  - `producthunt`: 1270x760
- डिवाइस फ़्रेम (`iphone`, `macbook`, `ipad`) छवि के चारों ओर एक हार्डवेयर बेज़ल लागू करते हैं और `borderRadius` सेटिंग को छोड़ देते हैं।
- जब पारदर्शिता आवश्यक हो (छाया, बॉर्डर त्रिज्या, डिवाइस फ़्रेम, या पारदर्शी पृष्ठभूमि), तो आउटपुट को PNG पर बाध्य किया जाता है भले ही `jpeg` चुना गया हो।
- पाइपलाइन/बैच मोड में छवि पृष्ठभूमि समर्थित नहीं है।
