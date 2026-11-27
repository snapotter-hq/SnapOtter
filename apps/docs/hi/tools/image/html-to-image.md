---
description: "device emulation के साथ वेबपेजों या HTML स्निपेट को उच्च-गुणवत्ता वाली छवियों के रूप में कैप्चर करें।"
i18n_source_hash: 307493f63631
i18n_provenance: machine
i18n_output_hash: 9d95c8ddd989
i18n_hash_version: 2
---

# HTML to Image {#html-to-image}

किसी वेबपेज URL या कच्ची HTML सामग्री को स्क्रीनशॉट छवि के रूप में कैप्चर करें। device emulation (desktop, tablet, mobile), full-page कैप्चर और कई आउटपुट प्रारूपों का समर्थन करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/html-to-image`

एक **JSON body** स्वीकार करता है (multipart नहीं)। किसी फ़ाइल अपलोड की आवश्यकता नहीं है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | सशर्त | - | कैप्चर करने के लिए URL (एक वैध URL होना चाहिए) |
| html | string | सशर्त | - | रेंडर करने के लिए कच्ची HTML सामग्री (1 से 5,000,000 वर्ण) |
| format | string | नहीं | `"png"` | आउटपुट प्रारूप: `jpg`, `png`, `webp` |
| quality | number | नहीं | `90` | lossy प्रारूपों के लिए आउटपुट गुणवत्ता (1 से 100) |
| fullPage | boolean | नहीं | `false` | केवल viewport नहीं, बल्कि पूरे स्क्रॉल करने योग्य पृष्ठ को कैप्चर करें |
| devicePreset | string | नहीं | `"desktop"` | device emulation: `desktop`, `tablet`, `mobile`, `custom` |
| viewportWidth | number | नहीं | `1280` | कस्टम viewport चौड़ाई पिक्सेल में (320 से 3840, जब devicePreset `custom` हो तब उपयोग होती है) |
| viewportHeight | number | नहीं | `720` | कस्टम viewport ऊँचाई पिक्सेल में (320 से 2160, जब devicePreset `custom` हो तब उपयोग होती है) |
| clientJobId | string | नहीं | - | आपकी अपनी जॉब ID, ताकि उत्तर आने से पहले ही आप प्रगति स्ट्रीम खोल सकें |

या तो `url` या `html` प्रदान किया जाना चाहिए, लेकिन दोनों नहीं।

### Device Presets {#device-presets}

| Preset | Width | Height | Mobile UA |
|--------|-------|--------|-----------|
| `desktop` | 1280 | 720 | नहीं |
| `tablet` | 768 | 1024 | नहीं |
| `mobile` | 375 | 812 | हाँ |
| `custom` | (उपयोगकर्ता-निर्दिष्ट) | (उपयोगकर्ता-निर्दिष्ट) | नहीं |

## Example Request {#example-request}

किसी वेबपेज को कैप्चर करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "format": "png", "fullPage": true, "devicePreset": "desktop"}'
```

HTML सामग्री रेंडर करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"html": "<div style=\"padding: 20px; background: #f0f0f0;\"><h1>Hello</h1></div>", "format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 0,
  "processedSize": 145000
}
```

### Slow pages {#slow-pages}

कैप्चर एक कतारबद्ध जॉब के रूप में चलता है। जो कैप्चर सिंक्रोनस प्रतीक्षा अवधि के भीतर पूरा हो जाता है, वह ऊपर दिए परिणाम के साथ `200` लौटाता है। धीमा कैप्चर जॉब ID के साथ `202` लौटाता है:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true,
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress"
}
```

जॉब पूरा होने तक `progressUrl` (Server-Sent Events) को फ़ॉलो करें। completed इवेंट में वही परिणाम ऑब्जेक्ट होता है जो `200` उत्तर में होता है। आप जॉब को `POST /api/v1/jobs/{jobId}/cancel` से रद्द कर सकते हैं।

::: warning 2.3.0 के बाद बदला गया
2.3.0 तक यह endpoint हमेशा कैप्चर पूरा होने तक अनुरोध को खुला रखता था और `200` लौटाता था। जो स्क्रिप्ट केवल `200` को संभालती हैं, उन्हें `202` भी संभालना चाहिए।
:::

## Notes {#notes}

- सर्वर पर Chromium इंस्टॉल होना आवश्यक है। यदि browser सेवा उपलब्ध नहीं है तो HTTP 503 लौटाता है।
- URLs को SSRF हमलों के विरुद्ध सत्यापित किया जाता है (निजी/आंतरिक नेटवर्क पते अवरुद्ध हैं)।
- यह endpoint प्रति घंटे 120 अनुरोधों तक दर-सीमित है।
- `originalSize` हमेशा 0 होता है क्योंकि यह टूल URLs/HTML से छवियाँ जनरेट करता है।
- आउटपुट फ़ाइलनाम `screenshot.<format>` है।
- यदि पृष्ठ लोड होने में बहुत अधिक समय लेता है, तो कैप्चर HTTP 504 (gateway timeout) के साथ विफल हो जाता है।
- यदि browser सेवा बार-बार क्रैश होती है, तो इसे अस्थायी रूप से अक्षम कर दिया जाता है और कैप्चर code `BROWSER_CRASHED` के साथ HTTP 503 पर विफल होता है।
- browser क्रैश (HTTP 503) की विफलता बताने से पहले उसे एक बार फिर आज़माया जाता है, अन्य कतारबद्ध इमेज जॉब की तरह। पेज-लोड टाइमआउट को दोबारा नहीं आज़माया जाता।
- जो कैप्चर पहले ही `202` लौटा चुका है, वह विफलता की सूचना HTTP स्टेटस में नहीं, बल्कि अपनी प्रगति स्ट्रीम पर देता है।
