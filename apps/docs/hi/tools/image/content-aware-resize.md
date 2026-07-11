---
description: "सीम-कार्विंग आकार बदलना जो प्रमुख सामग्री और चेहरों को संरक्षित करने के लिए कम-महत्व वाले पथों के साथ पिक्सेल जोड़ता या हटाता है।"
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: e17ef26ea7e2
---

# Content-Aware Resize {#content-aware-resize}

सीम कार्विंग आकार बदलना जो न्यूनतम दृश्य महत्व वाले पथों के साथ बुद्धिमानी से पिक्सेल हटाता या जोड़ता है, महत्वपूर्ण सामग्री को संरक्षित करता है और वैकल्पिक रूप से चेहरों की रक्षा करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Processing:** तुल्यकालिक (परिणाम सीधे लौटाता है)

**Model bundle:** बुनियादी संचालन के लिए कोई आवश्यक नहीं। सक्षम होने पर चेहरा सुरक्षा `face-detection` बंडल (200-300 MB) का उपयोग करती है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | छवि फ़ाइल (मल्टीपार्ट) |
| width | number | No | - | पिक्सेल में लक्षित चौड़ाई |
| height | number | No | - | पिक्सेल में लक्षित ऊँचाई |
| protectFaces | boolean | No | `false` | सीम हटाने से चेहरों का पता लगाएँ और उन्हें सुरक्षित रखें |
| blurRadius | number | No | `4` | ऊर्जा गणना के लिए पूर्व-प्रसंस्करण ब्लर त्रिज्या (0-20) |
| sobelThreshold | number | No | `2` | Sobel किनारा पहचान सीमा (1-20)। उच्च मान एल्गोरिथ्म को अधिक आक्रामक बनाते हैं |
| square | boolean | No | `false` | वर्ग में आकार बदलें (छोटे आयाम का उपयोग करता है) |

`width`, `height`, या `square` में से कम से कम एक निर्दिष्ट किया जाना चाहिए।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- यह कस्टम रूट वर्तमान में एक तुल्यकालिक 200 प्रतिक्रिया लौटाता है।
- सामग्री-जागरूक आकार बदलने के लिए `caire` सीम कार्विंग लाइब्रेरी का उपयोग करता है।
- केवल आयाम घटाता है (सीम हटाता है)। किसी छवि को उसके मूल आकार से आगे विस्तारित नहीं कर सकता।
- `protectFaces` विकल्प चेहरा क्षेत्रों को उच्च-ऊर्जा के रूप में चिह्नित करने के लिए AI चेहरा पहचान का उपयोग करता है, जिससे सीम को चेहरों से गुज़रने से रोका जाता है।
- `blurRadius` ऊर्जा मानचित्र गणना से पहले चौरसाई को नियंत्रित करता है। उच्च मान ऊर्जा मानचित्र को अधिक एकसमान बनाते हैं, जो शोरयुक्त छवियों के साथ मदद कर सकता है।
- `sobelThreshold` प्रभावित करता है कि किनारों का पता कितनी आक्रामकता से लगाया जाता है। कम मान अधिक सूक्ष्म किनारों को संरक्षित करते हैं।
- आउटपुट हमेशा PNG फ़ॉर्मेट होता है।
- स्वचालित डिकोडिंग के माध्यम से HEIC/HEIF, RAW, TGA, PSD, EXR, और HDR इनपुट फ़ॉर्मेट का समर्थन करता है।
