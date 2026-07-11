---
description: "अनुकरण करें कि विभिन्न प्रकार की रंग दृष्टि कमी वाले लोगों को छवियाँ कैसी दिखती हैं।"
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: d96a668fe7b6
---

# Color Blindness Simulation {#color-blindness-simulation}

रंग दृष्टि कमी (CVD) का अनुकरण करें ताकि यह पूर्वावलोकन किया जा सके कि विभिन्न प्रकार के रंग अंधत्व वाले लोगों को छवियाँ कैसी दिखती हैं। डिज़ाइन, चार्ट, और UI के अभिगम्यता परीक्षण के लिए उपयोगी।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

एक छवि फ़ाइल और एक JSON `settings` फ़ील्ड के साथ मल्टीपार्ट फ़ॉर्म डेटा स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | अनुकरण करने के लिए रंग दृष्टि कमी का प्रकार |

### Simulation Types {#simulation-types}

| Value | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | लाल-अंध | लाल शंकु कोशिकाओं की पूर्ण अनुपस्थिति |
| `deuteranopia` | हरा-अंध | हरी शंकु कोशिकाओं की पूर्ण अनुपस्थिति |
| `tritanopia` | नीला-अंध | नीली शंकु कोशिकाओं की पूर्ण अनुपस्थिति |
| `protanomaly` | लाल-कमज़ोर | घटी हुई लाल शंकु संवेदनशीलता |
| `deuteranomaly` | हरा-कमज़ोर | घटी हुई हरी शंकु संवेदनशीलता (सबसे सामान्य) |
| `tritanomaly` | नीला-कमज़ोर | घटी हुई नीली शंकु संवेदनशीलता |
| `achromatopsia` | पूर्ण रंग अंध | रंग दृष्टि की पूर्ण अनुपस्थिति |
| `blueConeMonochromacy` | केवल नीला-शंकु | केवल नीले शंकु कार्यशील |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- Deuteranomaly (हरा-कमज़ोर) डिफ़ॉल्ट है क्योंकि यह रंग दृष्टि कमी का सबसे सामान्य रूप है, जो लगभग 6% पुरुषों को प्रभावित करता है।
- यह अनुकरण रंग परिवर्तन मैट्रिक्स का उपयोग करता है जो यह मॉडल करते हैं कि घटे हुए या अनुपस्थित शंकु प्रकाशग्राही अनुभव किए गए रंगों को कैसे बदलते हैं।
- यह टूल गैर-विनाशकारी है और केवल एक पूर्वावलोकन उत्पन्न करता है। यह अभिगम्यता के लिए मूल छवि को संशोधित नहीं करता।
- आउटपुट फ़ॉर्मेट इनपुट फ़ॉर्मेट से मेल खाता है। HEIC, RAW, PSD, और SVG इनपुट प्रोसेसिंग से पहले स्वचालित रूप से डिकोड किए जाते हैं।
