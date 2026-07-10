---
description: "पिक्सेल को पुनः-एन्कोड किए बिना छवियों में EXIF, IPTC, GPS, और XMP मेटाडेटा फ़ील्ड संपादित करें।"
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: 207a10193804
---

# Edit Metadata {#edit-metadata}

EXIF, IPTC, GPS निर्देशांक, तिथियाँ, और कीवर्ड सहित छवि मेटाडेटा फ़ील्ड संपादित करें। पर्दे के पीछे ExifTool का उपयोग करता है, इसलिए मेटाडेटा पिक्सेल को पुनः-एन्कोड किए बिना यथास्थान लिखा जाता है, जिससे पूर्ण छवि गुणवत्ता संरक्षित रहती है।

## API Endpoints {#api-endpoints}

### Edit Metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

छवि में मेटाडेटा फ़ील्ड लिखता है और संशोधित फ़ाइल लौटाता है।

### Inspect Metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

ExifTool के माध्यम से छवि से पूर्ण मेटाडेटा JSON के रूप में लौटाता है। छवि को संशोधित नहीं करता।

## Parameters (Edit) {#parameters-edit}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | छवि शीर्षक (XMP/EXIF) |
| author | string | No | - | लेखक का नाम |
| artist | string | No | - | कलाकार का नाम (EXIF Artist टैग) |
| copyright | string | No | - | कॉपीराइट सूचना |
| imageDescription | string | No | - | छवि विवरण (EXIF) |
| software | string | No | - | Software टैग |
| dateTime | string | No | - | EXIF DateTime मान |
| dateTimeOriginal | string | No | - | EXIF DateTimeOriginal मान |
| setAllDates | string | No | - | सभी तिथि फ़ील्ड एक साथ सेट करें |
| dateShift | string | No | - | सभी तिथियों को ऑफ़सेट से स्थानांतरित करें (फ़ॉर्मेट: `+HH:MM` या `-HH:MM`) |
| clearGps | boolean | No | `false` | सभी GPS डेटा हटाएँ |
| gpsLatitude | number | No | - | GPS अक्षांश सेट करें (-90 से 90) |
| gpsLongitude | number | No | - | GPS देशांतर सेट करें (-180 से 180) |
| gpsAltitude | number | No | - | मीटर में GPS ऊँचाई सेट करें |
| keywords | string[] | No | - | जोड़ने या सेट करने के लिए कीवर्ड/टैग |
| keywordsMode | string | No | `"add"` | कीवर्ड को कैसे संभालें: `add` (जोड़ें) या `set` (प्रतिस्थापित करें) |
| fieldsToRemove | string[] | No | `[]` | हटाने के लिए विशिष्ट मेटाडेटा फ़ील्ड नामों की सूची |
| iptcTitle | string | No | - | IPTC Object Name |
| iptcHeadline | string | No | - | IPTC Headline |
| iptcCity | string | No | - | IPTC City |
| iptcState | string | No | - | IPTC Province/State |
| iptcCountry | string | No | - | IPTC Country |

## Example Request {#example-request}

लेखक और कॉपीराइट सेट करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS निर्देशांक सेट करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPS हटाएँ और कीवर्ड जोड़ें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

मेटाडेटा का निरीक्षण करें:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Edit) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Notes {#notes}

- इस टूल के लिए सर्वर पर ExifTool स्थापित होना आवश्यक है। यह Docker छवि में शामिल है।
- मेटाडेटा यथास्थान लिखा जाता है, इसलिए कोई पिक्सेल पुनः-एन्कोडिंग नहीं होती। फ़ाइल आकार में परिवर्तन न्यूनतम है (केवल मेटाडेटा बाइट्स)।
- `dateShift` पैरामीटर सभी तिथि फ़ील्ड को निर्दिष्ट ऑफ़सेट से स्थानांतरित करता है, जो समय क्षेत्र त्रुटियों को सुधारने के लिए उपयोगी है (उदा. `+02:00` या `-05:30`)।
- यदि कोई परिवर्तन अनुरोधित नहीं है (सभी पैरामीटर छोड़ दिए गए या खाली हैं), तो मूल फ़ाइल अपरिवर्तित लौटाई जाती है।
- समर्थित फ़ॉर्मेट: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF।
- गैर-ब्राउज़र-पूर्वावलोकन योग्य फ़ॉर्मेट (HEIF, TIFF) के लिए, प्रतिक्रिया में WebP पूर्वावलोकन के साथ एक `previewUrl` फ़ील्ड शामिल होता है।
