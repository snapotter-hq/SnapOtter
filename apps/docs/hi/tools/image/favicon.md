---
description: "किसी स्रोत छवि से सभी मानक favicon और app आइकन आकार जनरेट करें।"
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: eb3a99b7652f
---

# Favicon Generator {#favicon-generator}

किसी स्रोत छवि से favicon और app आइकन फ़ाइलों का पूरा सेट जनरेट करें। ब्राउज़रों, Apple डिवाइसों और Android के लिए आवश्यक सभी मानक आकार बनाता है, साथ ही एक web manifest और एक HTML स्निपेट भी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/favicon`

एक या अधिक image फ़ाइलों और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| background | string | नहीं | - | Background hex रंग (जैसे `"#ffffff"`)। सेट होने पर, आइकन को इस रंग पर फ़्लैट कर दिया जाता है। |
| padding | integer | नहीं | `0` | आइकन सामग्री के चारों ओर Padding प्रतिशत (0 से 40) |
| radius | integer | नहीं | `0` | गोल आइकनों के लिए Corner radius प्रतिशत (0 से 50) |
| sizes | integer[] | नहीं | - | आउटपुट को विशिष्ट पिक्सेल आकारों तक सीमित करें (जैसे `[16, 32, 180]`)। सभी मानक आकार जनरेट करने के लिए इसे छोड़ दें। |
| themeColor | string | नहीं | `"#ffffff"` | web manifest के लिए Theme रंग hex |

## Generated Files {#generated-files}

प्रत्येक इनपुट छवि के लिए, निम्नलिखित फ़ाइलें बनाई जाती हैं:

| File | Size | Purpose |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Browser tab आइकन |
| `favicon-32x32.png` | 32x32 | Browser tab आइकन (HiDPI) |
| `favicon-48x48.png` | 48x48 | Desktop शॉर्टकट |
| `apple-touch-icon.png` | 180x180 | iOS होम स्क्रीन |
| `android-chrome-192x192.png` | 192x192 | Android होम स्क्रीन |
| `android-chrome-512x512.png` | 512x512 | Android स्प्लैश स्क्रीन |
| `favicon.ico` | 32x32 | Legacy ICO प्रारूप |
| `manifest.json` | - | आइकन संदर्भों के साथ web app manifest |
| `favicon-snippet.html` | - | उपयोग के लिए तैयार HTML link टैग |

## Example Request {#example-request}

गोल किनारों और padding के साथ एकल स्रोत छवि:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

एकाधिक स्रोत छवियाँ (प्रत्येक को एक सबफ़ोल्डर में अपना सेट मिलता है):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Example Response {#example-response}

प्रतिक्रिया एक ZIP फ़ाइल है जो सीधे स्ट्रीम की जाती है। प्रतिक्रिया हेडर इस प्रकार हैं:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## HTML Snippet Included {#html-snippet-included}

ZIP में एक `favicon-snippet.html` फ़ाइल शामिल है जिसे आप अपने HTML `<head>` में पेस्ट कर सकते हैं:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notes {#notes}

- स्रोत छवियों का आकार `cover` fit मोड का उपयोग करके बदला जाता है, यानी उन्हें प्रत्येक वर्गाकार आकार को भरने के लिए क्रॉप किया जाता है। सर्वोत्तम परिणामों के लिए, एक वर्गाकार स्रोत छवि का उपयोग करें।
- जब एकाधिक फ़ाइलें अपलोड की जाती हैं, तो प्रत्येक को ZIP में अपना सबफ़ोल्डर मिलता है (स्रोत फ़ाइल के नाम पर)।
- एकल फ़ाइल अपलोड के लिए, सभी आउटपुट बिना किसी सबफ़ोल्डर के ZIP की जड़ में होते हैं।
- जो फ़ाइलें सत्यापन या डिकोडिंग में विफल होती हैं उन्हें छोड़ दिया जाता है, और समस्याओं को समझाने वाला एक `skipped-files.txt` ZIP में शामिल किया जाता है।
- समर्थित इनपुट प्रारूप: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD और अन्य।
- आकार बदलने से पहले EXIF orientation स्वतः लागू किया जाता है।
