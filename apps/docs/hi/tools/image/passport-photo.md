---
description: "फेस डिटेक्शन, बैकग्राउंड हटाने और प्रिंट शीट टाइलिंग के साथ AI-संचालित पासपोर्ट और ID फ़ोटो जनरेटर।"
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: eb0abd3dfc5d
---

# Passport Photo {#passport-photo}

AI-संचालित पासपोर्ट और ID फ़ोटो जनरेटर। दो-चरण वर्कफ़्लो: विश्लेषण (फेस डिटेक्शन + बैकग्राउंड हटाना) फिर जनरेट (क्रॉप, आकार बदलना और प्रिंटिंग के लिए टाइलिंग)।

## API Endpoints {#api-endpoints}

यह टूल विश्लेषण और जनरेशन के लिए अलग-अलग एंडपॉइंट्स के साथ दो-चरण प्रवाह का उपयोग करता है।

**Model bundles:** `background-removal` और `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

फेस लैंडमार्क का पता लगाता है और बैकग्राउंड हटाता है। फ्रंटएंड को क्रॉप प्रीव्यू प्रदर्शित करने के लिए लैंडमार्क डेटा और एक प्रीव्यू लौटाता है।

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | इमेज फ़ाइल (multipart) |
| clientJobId | string | No | - | SSE के माध्यम से प्रगति ट्रैकिंग के लिए वैकल्पिक जॉब ID |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

यदि `clientJobId` प्रदान किया गया हो, तो प्रगति स्ट्रीम की जाती है (फेस डिटेक्शन के लिए 0-30%, बैकग्राउंड हटाने के लिए 30-95%)।

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

फ़ोटो को क्रॉप, आकार बदलता है और वैकल्पिक रूप से एक प्रिंट शीट पर टाइल करता है। Phase 1 से कैश की गई इमेज का उपयोग करता है (कोई AI पुनः-रन नहीं)।

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | Phase 1 से जॉब ID |
| filename | string | Yes | - | Phase 1 से मूल फ़ाइल नाम |
| countryCode | string | Yes | - | पासपोर्ट स्पेक के लिए देश कोड (उदा., `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | दस्तावेज़ प्रकार (देश स्पेक से) |
| bgColor | string | No | `"#FFFFFF"` | बैकग्राउंड रंग hex |
| printLayout | string | No | `"none"` | प्रिंट पेपर लेआउट: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | KB में अधिकतम फ़ाइल आकार सीमा (0 = कोई सीमा नहीं) |
| dpi | number | No | `300` | आउटपुट DPI (72-1200) |
| customWidthMm | number | No | - | mm में कस्टम फ़ोटो चौड़ाई (देश स्पेक को ओवरराइड करता है) |
| customHeightMm | number | No | - | mm में कस्टम फ़ोटो ऊँचाई (देश स्पेक को ओवरराइड करता है) |
| zoom | number | No | `1` | ज़ूम फ़ैक्टर (0.5-3)। 1 से अधिक मान अधिक कसकर क्रॉप करते हैं |
| adjustX | number | No | `0` | क्षैतिज स्थिति समायोजन |
| adjustY | number | No | `0` | ऊर्ध्वाधर स्थिति समायोजन |
| landmarks | object | Yes | - | Phase 1 प्रतिक्रिया से लैंडमार्क ऑब्जेक्ट |
| imageWidth | number | Yes | - | Phase 1 प्रतिक्रिया से इमेज चौड़ाई |
| imageHeight | number | Yes | - | Phase 1 प्रतिक्रिया से इमेज ऊँचाई |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

सही सब-एंडपॉइंट का उपयोग करने के लिए मार्गदर्शन लौटाता है।

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- `background-removal` और `face-detection` मॉडल बंडल का इंस्टॉल होना आवश्यक है।
- Phase 1 AI चलाता है (फेस लैंडमार्क + बैकग्राउंड हटाना) और परिणामों को कैश करता है। Phase 2 शुद्ध Sharp इमेज हेरफेर है (तेज़, कोई AI आवश्यक नहीं)।
- लैंडमार्क सामान्यीकृत निर्देशांक के रूप में लौटाए जाते हैं (इमेज आयामों के सापेक्ष 0-1 रेंज)।
- विश्लेषण प्रतिक्रिया में `preview` फ़ील्ड तेज़ प्रदर्शन के लिए एक base64-एन्कोडेड PNG (अधिकतम 800px चौड़ा) है।
- देश स्पेक में आधिकारिक पासपोर्ट फ़ोटो आवश्यकताओं के आधार पर दस्तावेज़ आयाम, सिर की ऊँचाई अनुपात और आँख-रेखा स्थिति शामिल है।
- `printLayout` विकल्प फ़ोटो के बीच 2mm गटर के साथ 4x6\" या A4 पेपर पर एक टाइल की गई शीट जनरेट करता है।
- जब `maxFileSizeKb` सेट किया जाता है, तो आउटपुट को आकार सीमा के भीतर फ़िट करने के लिए पुनरावृत्त रूप से संपीड़ित किया जाता है।
