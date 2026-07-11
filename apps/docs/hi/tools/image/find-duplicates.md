---
description: "perceptual hashing का उपयोग करके डुप्लिकेट और लगभग-डुप्लिकेट छवियों का पता लगाएँ।"
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 01b3ff8dc3b0
---

# Find Duplicates {#find-duplicates}

perceptual hashing (dHash) का उपयोग करके डुप्लिकेट और लगभग-डुप्लिकेट का पता लगाने के लिए कई छवियाँ अपलोड करें। समान छवियों को एक साथ समूहित करता है, प्रत्येक समूह में सर्वोत्तम गुणवत्ता वाले संस्करण की पहचान करता है, और संभावित स्थान बचत की गणना करता है।

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

एकाधिक image फ़ाइलों और एक वैकल्पिक JSON `settings` फ़ील्ड के साथ multipart form data स्वीकार करता है।

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| threshold | number | नहीं | `8` | छवियों को डुप्लिकेट मानने के लिए अधिकतम Hamming दूरी (0 से 20)। कम = सख़्त मिलान |

### File Fields {#file-fields}

multipart अनुरोध में कम से कम 2 image फ़ाइलें अपलोड करें (सभी `file` फ़ील्ड नाम का उपयोग करते हुए या फ़ाइल भागों के लिए कोई भी फ़ील्ड नाम)।

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Example Response {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Response Fields {#response-fields}

| Field | Type | Description |
|-------|------|-------------|
| totalImages | number | सफलतापूर्वक विश्लेषित छवियों की संख्या |
| duplicateGroups | array | डुप्लिकेट छवियों के समूह |
| uniqueImages | number | किसी भी डुप्लिकेट समूह का हिस्सा न होने वाली छवियों की संख्या |
| spaceSaveable | number | गैर-सर्वोत्तम डुप्लिकेट हटाकर बचाए जा सकने वाले कुल बाइट |
| skippedFiles | array | ऐसी फ़ाइलें जिन्हें संसाधित नहीं किया जा सका (फ़ाइलनाम और कारण के साथ) |

### Duplicate Group Object {#duplicate-group-object}

| Field | Type | Description |
|-------|------|-------------|
| groupId | number | समूह पहचानकर्ता |
| files | array | इस डुप्लिकेट समूह की छवियाँ |

### File Object (within a group) {#file-object-within-a-group}

| Field | Type | Description |
|-------|------|-------------|
| filename | string | मूल फ़ाइलनाम |
| similarity | number | संदर्भ छवि (समूह में पहली) के साथ समानता प्रतिशत |
| width | number | छवि चौड़ाई पिक्सेल में |
| height | number | छवि ऊँचाई पिक्सेल में |
| fileSize | number | फ़ाइल आकार बाइट में |
| format | string | छवि प्रारूप |
| isBest | boolean | क्या यह उच्चतम गुणवत्ता वाला संस्करण है (सबसे अधिक पिक्सेल, सबसे बड़ी फ़ाइल) |
| thumbnail | string या null | पूर्वावलोकन के लिए Base64 JPEG थंबनेल (200px चौड़ा) |

## Notes {#notes}

- perceptual समानता का पता लगाने के लिए 128-bit dHash (64-bit पंक्ति + 64-bit स्तंभ) का उपयोग करता है। यह आकार बदलने, पुनः-संपीड़न और छोटे संपादनों के बावजूद भी डुप्लिकेट पकड़ता है।
- threshold, hashes के बीच अधिकतम Hamming दूरी को दर्शाता है। 8 का डिफ़ॉल्ट झूठी सकारात्मकता से बचते हुए लगभग-डुप्लिकेट पकड़ता है। केवल पिक्सेल-समरूप के लिए 0 का उपयोग करें, या बहुत ढीले मिलान के लिए 15-20 का।
- प्रत्येक समूह में "सर्वोत्तम" छवि वह होती है जिसमें सबसे अधिक पिक्सेल (चौड़ाई x ऊँचाई) होते हैं, और फ़ाइल आकार टाईब्रेकर के रूप में होता है।
- कम से कम 2 छवियाँ आवश्यक हैं। जो फ़ाइलें सत्यापन या डिकोडिंग में विफल होती हैं उन्हें पूरे अनुरोध को विफल करने के बजाय `skippedFiles` में रिपोर्ट किया जाता है।
- थंबनेल 200px-चौड़े JPEG पूर्वावलोकन हैं जो data URIs के रूप में एन्कोड किए जाते हैं।
- सभी सामान्य प्रारूप समर्थित हैं (HEIC, RAW, PSD, SVG स्वचालित रूप से डिकोड किए जाते हैं)।
