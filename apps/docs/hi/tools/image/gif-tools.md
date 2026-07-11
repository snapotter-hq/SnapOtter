---
description: "एक ही टूल में animated GIFs का आकार बदलें, अनुकूलित करें, गति बदलें, उलटें, घुमाएँ और फ़्रेम निकालें।"
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: 1e304ec45635
---

# GIF Tools {#gif-tools}

animated GIFs का आकार बदलें, अनुकूलित करें, गति बदलें, उलटें, फ़्रेम निकालें और घुमाएँ। एक ही टूल में कई ऑपरेशन मोड प्रदान करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameters {#parameters}

### Common Parameters {#common-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | नहीं | `"resize"` | ऑपरेशन मोड: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | नहीं | 0 | आउटपुट GIF के लिए Loop गणना (0 = अनंत, 1-100 = परिमित लूप) |

### Resize Mode Parameters {#resize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | नहीं | - | लक्ष्य चौड़ाई पिक्सेल में (1 से 16384) |
| height | integer | नहीं | - | लक्ष्य ऊँचाई पिक्सेल में (1 से 16384) |
| percentage | number | नहीं | - | प्रतिशत के अनुसार स्केल करें (1 से 500)। सेट होने पर width/height को ओवरराइड करता है। |

### Optimize Mode Parameters {#optimize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colors | number | नहीं | 256 | पैलेट में रंगों की अधिकतम संख्या (2 से 256) |
| dither | number | नहीं | 1.0 | Dithering ताकत (0 से 1, जहाँ 0 dithering को अक्षम करता है) |
| effort | number | नहीं | 7 | अनुकूलन प्रयास स्तर (1 से 10, अधिक = धीमा लेकिन छोटा) |

### Speed Mode Parameters {#speed-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| speedFactor | number | नहीं | 1.0 | गति गुणक (0.1 से 10)। 1 से अधिक मान गति बढ़ाते हैं, 1 से कम गति घटाते हैं। |

### Extract Mode Parameters {#extract-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| extractMode | string | नहीं | `"single"` | निष्कर्षण मोड: `single`, `range`, `all` |
| frameNumber | number | नहीं | 0 | `single` मोड में निकालने के लिए फ़्रेम अनुक्रमणिका (0-आधारित) |
| frameStart | number | नहीं | 0 | `range` मोड के लिए प्रारंभ फ़्रेम अनुक्रमणिका (0-आधारित) |
| frameEnd | number | नहीं | - | `range` मोड के लिए अंतिम फ़्रेम अनुक्रमणिका (0-आधारित, समावेशी) |
| extractFormat | string | नहीं | `"png"` | निकाले गए फ़्रेमों के लिए प्रारूप: `png`, `webp` |

### Rotate Mode Parameters {#rotate-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | नहीं | - | घूर्णन कोण: `90`, `180`, या `270` डिग्री |
| flipH | boolean | नहीं | `false` | क्षैतिज रूप से फ़्लिप करें |
| flipV | boolean | नहीं | `false` | लंबवत रूप से फ़्लिप करें |

## Example Requests {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Speed Up {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extract Single Frame {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

संसाधित किए बिना किसी animated GIF के बारे में मेटाडेटा लौटाता है।

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info Response {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notes {#notes}

- मुख्य प्रसंस्करण endpoint के लिए मानक `createToolRoute` factory का उपयोग करता है।
- info endpoint को केवल एक फ़ाइल अपलोड की आवश्यकता होती है (किसी सेटिंग की ज़रूरत नहीं)।
- `resize` मोड में, यदि `percentage` प्रदान किया जाता है तो यह `width`/`height` पर प्राथमिकता लेता है। आकार बदलने के लिए aspect ratio बनाए रखने हेतु `fit: inside` का उपयोग किया जाता है।
- `speed` मोड में, फ़्रेम विलंब को speed factor से विभाजित किया जाता है। प्रति फ़्रेम न्यूनतम विलंब 20ms है (GIF स्पेक सीमा)।
- `reverse` मोड में, उलटते समय गति को एक साथ समायोजित करने के लिए `speedFactor` parameter भी उपलब्ध है।
- `extract` मोड में `range` या `all` के साथ, आउटपुट एक ZIP फ़ाइल होती है जिसमें अलग-अलग फ़्रेम होते हैं।
- `rotate` मोड में, प्रत्येक फ़्रेम को अलग से संसाधित किया जाता है और एक एनिमेशन में पुनः जोड़ा जाता है।
- `loop` parameter नियंत्रित करता है कि आउटपुट GIF कितनी बार लूप करता है। अनंत लूपिंग के लिए 0 का उपयोग करें।
- info प्रतिक्रिया में `duration` फ़ील्ड मिलीसेकंड में कुल एनिमेशन अवधि है।
