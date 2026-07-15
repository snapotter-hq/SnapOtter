---
description: "गोपनीयता और छोटे फ़ाइल आकार के लिए छवियों से EXIF, GPS, ICC, और XMP मेटाडेटा हटाएँ।"
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: fec74f7b6c23
---

# इमेज मेटाडेटा हटाएं {#remove-metadata}

छवियों से EXIF, GPS, ICC कलर प्रोफ़ाइल, और XMP मेटाडेटा हटाएँ। गोपनीयता (GPS निर्देशांक, कैमरा जानकारी हटाना) और फ़ाइल आकार कम करने के लिए उपयोगी।

## API Endpoints {#api-endpoints}

### Strip Metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

छवि को प्रोसेस करता है और चयनित मेटाडेटा हटाए गए एक स्वच्छ संस्करण लौटाता है।

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

छवि को संशोधित किए बिना पार्स किए गए मेटाडेटा को JSON के रूप में लौटाता है। स्ट्रिपिंग से पहले कौन सा मेटाडेटा मौजूद है यह पूर्वावलोकन करने के लिए उपयोगी।

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | EXIF डेटा हटाएँ (कैमरा सेटिंग्स, तिथियाँ, आदि) |
| stripGps | boolean | No | `false` | केवल GPS/स्थान डेटा हटाएँ |
| stripIcc | boolean | No | `false` | ICC कलर प्रोफ़ाइल हटाएँ |
| stripXmp | boolean | No | `false` | XMP मेटाडेटा हटाएँ (Adobe, IPTC) |
| stripAll | boolean | No | `true` | सारा मेटाडेटा एक साथ हटाएँ |

जब `stripAll` `true` हो, तो यह व्यक्तिगत फ़्लैग को ओवरराइड करता है और सब कुछ हटा देता है।

## Example Request {#example-request}

सारा मेटाडेटा हटाएँ:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

केवल GPS डेटा हटाएँ (कैमरा जानकारी और कलर प्रोफ़ाइल रखें):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

संशोधित किए बिना मेटाडेटा का निरीक्षण करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Notes {#notes}

- स्ट्रिपिंग के बाद छवि को उसके मूल फ़ॉर्मेट में फिर से एन्कोड किया जाता है। JPEG गुणवत्ता 90 पर mozjpeg का उपयोग करता है, PNG कम्प्रेशन स्तर 9 का उपयोग करता है, WebP गुणवत्ता 85 का उपयोग करता है।
- यदि छवि को गैर-sRGB प्रोफ़ाइल के साथ टैग किया गया था तो ICC प्रोफ़ाइल हटाने से सूक्ष्म रंग बदलाव हो सकते हैं। यदि रंग सटीकता मायने रखती है तो `stripIcc: false` का उपयोग करें।
- इंस्पेक्ट एंडपॉइंट सुविधा के लिए GPS निर्देशांकों को दशमलव अक्षांश/देशांतर मानों (अंडरस्कोर से उपसर्गित) में पार्स करता है।
- समर्थित इनपुट फ़ॉर्मेट: JPEG, PNG, WebP, AVIF, TIFF, GIF।
