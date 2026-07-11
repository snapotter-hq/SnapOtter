---
description: "इमेज इंजन ऑपरेशन संदर्भ। सभी Sharp-आधारित इमेज प्रोसेसिंग ऑपरेशन और उनके पैरामीटर।"
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: bb900524712f
---

# इमेज इंजन {#image-engine}

`@snapotter/image-engine` पैकेज सभी गैर-AI इमेज ऑपरेशनों को संभालता है। यह [Sharp](https://sharp.pixelplumbing.com/) को रैप करता है और बिना किसी बाहरी निर्भरता के पूरी तरह इन-प्रोसेस चलता है।

## ऑपरेशन {#operations}

### resize {#resize}

एक इमेज को विशिष्ट आयामों तक या प्रतिशत के अनुसार स्केल करें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `width` | number | पिक्सेल में लक्ष्य चौड़ाई |
| `height` | number | पिक्सेल में लक्ष्य ऊँचाई |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, या `outside` |
| `withoutEnlargement` | boolean | यदि true, छोटी इमेज को अपस्केल नहीं करेगा |
| `percentage` | number | निरपेक्ष आयामों के बजाय प्रतिशत के अनुसार स्केल करें |

आप `width`, `height`, या दोनों सेट कर सकते हैं। यदि आप केवल एक सेट करते हैं, तो पहलू अनुपात बनाए रखने के लिए दूसरे की गणना की जाती है।

### crop {#crop}

इमेज से एक आयताकार क्षेत्र काटें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `left` | number | बाएँ किनारे से X ऑफसेट |
| `top` | number | ऊपरी किनारे से Y ऑफसेट |
| `width` | number | क्रॉप क्षेत्र की चौड़ाई |
| `height` | number | क्रॉप क्षेत्र की ऊँचाई |
| `unit` | string | `px` (डिफ़ॉल्ट) या `percent` |

### rotate {#rotate}

इमेज को दिए गए कोण से घुमाएँ।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `angle` | number | डिग्री में घूर्णन कोण (0-360) |
| `background` | string | उजागर क्षेत्र के लिए भरण रंग (डिफ़ॉल्ट: `#000000`)। केवल गैर-90-डिग्री कोणों पर लागू होता है। |

### flip {#flip}

इमेज को क्षैतिज, ऊर्ध्वाधर, या दोनों रूप से मिरर करें। कम से कम एक true होना चाहिए।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `horizontal` | boolean | बाएँ से दाएँ मिरर करें |
| `vertical` | boolean | ऊपर से नीचे मिरर करें |

### convert {#convert}

इमेज फ़ॉर्मेट बदलें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `format` | string | लक्ष्य फ़ॉर्मेट: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | संपीड़न गुणवत्ता (1-100, लॉसी फ़ॉर्मेट पर लागू होती है) |

पहले सात फ़ॉर्मेट (`jpg` से `jxl` तक) Sharp द्वारा इन-प्रोसेस एन्कोड किए जाते हैं। शेष फ़ॉर्मेट API परत पर बाहरी एन्कोडर का उपयोग करते हैं: `heic`/`heif` heif-enc के माध्यम से, `bmp`/`ico` ImageMagick के माध्यम से, `jp2` opj_compress के माध्यम से, और `qoi` एक इनलाइन TypeScript कोडेक के माध्यम से।

### compress {#compress}

समान फ़ॉर्मेट रखते हुए फ़ाइल आकार कम करें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `quality` | number | लक्ष्य गुणवत्ता (1-100) |
| `targetSizeBytes` | number | बाइट्स में वैकल्पिक लक्ष्य फ़ाइल आकार |
| `format` | string | वैकल्पिक फ़ॉर्मेट ओवरराइड |

### strip-metadata {#strip-metadata}

इमेज से EXIF, IPTC, XMP, और ICC मेटाडेटा हटाएँ। बिना किसी पैरामीटर (या `stripAll: true`) के, सब कुछ हटा देता है। चयनात्मक हटाने के लिए व्यक्तिगत फ़्लैग पास करें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `stripAll` | boolean | सभी मेटाडेटा हटाएँ (कोई फ़्लैग सेट न होने पर डिफ़ॉल्ट) |
| `stripExif` | boolean | EXIF डेटा हटाएँ (GPS सहित यदि `stripGps` अलग से सेट नहीं है) |
| `stripGps` | boolean | GPS स्थान डेटा हटाएँ |
| `stripIcc` | boolean | ICC रंग प्रोफ़ाइल हटाएँ |
| `stripXmp` | boolean | XMP मेटाडेटा हटाएँ |

### रंग समायोजन {#color-adjustments}

ये ऑपरेशन एक इमेज के रंग गुणों को संशोधित करते हैं। प्रत्येक एक एकल संख्यात्मक मान लेता है।

| ऑपरेशन | पैरामीटर | सीमा | विवरण |
|---|---|---|---|
| `brightness` | `value` | -100 से 100 | चमक समायोजित करें |
| `contrast` | `value` | -100 से 100 | कंट्रास्ट समायोजित करें |
| `saturation` | `value` | -100 से 100 | रंग संतृप्ति समायोजित करें |

### रंग फ़िल्टर {#color-filters}

ये एक निश्चित रंग रूपांतरण लागू करते हैं। ये कोई पैरामीटर नहीं लेते।

| ऑपरेशन | विवरण |
|---|---|
| `grayscale` | ग्रेस्केल में परिवर्तित करें |
| `sepia` | सेपिया टोन लागू करें |
| `invert` | सभी रंग उलटें |

### रंग चैनल {#color-channels}

व्यक्तिगत RGB रंग चैनल समायोजित करें। मान गुणक हैं जहाँ 100 = कोई परिवर्तन नहीं।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `red` | number | लाल चैनल गुणक (0 से 200, 100 = अपरिवर्तित) |
| `green` | number | हरा चैनल गुणक (0 से 200, 100 = अपरिवर्तित) |
| `blue` | number | नीला चैनल गुणक (0 से 200, 100 = अपरिवर्तित) |

### sharpen {#sharpen}

एक एकल मान द्वारा नियंत्रित सरल तीक्ष्णीकरण।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `value` | number | तीक्ष्णीकरण तीव्रता (0 से 100)। 0.5-10 के गॉसियन सिग्मा पर मैप किया गया। |

### sharpen-advanced {#sharpen-advanced}

तीन चयन योग्य विधियों और एक वैकल्पिक नॉइज़-न्यूनीकरण प्री-पास के साथ उन्नत तीक्ष्णीकरण।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, या `high-pass` |
| `sigma` | number | गॉसियन ब्लर त्रिज्या, 0.5-10 (अनुकूली) |
| `m1` | number | समतल-क्षेत्र तीक्ष्णीकरण, 0-10 (अनुकूली) |
| `m2` | number | बनावट-क्षेत्र तीक्ष्णीकरण, 0-20 (अनुकूली) |
| `x1` | number | समतल/दांतेदार सीमा, 0-10 (अनुकूली) |
| `y2` | number | अधिकतम चमकीलापन (हेलो क्लैंप), 0-50 (अनुकूली) |
| `y3` | number | अधिकतम अंधेरापन (हेलो क्लैंप), 0-50 (अनुकूली) |
| `amount` | number | तीव्रता प्रतिशत, 0-500 (unsharp-mask) |
| `radius` | number | ब्लर त्रिज्या, 0.1-5.0 (unsharp-mask) |
| `threshold` | number | न्यूनतम किनारा चमक, 0-255 (unsharp-mask) |
| `strength` | number | ब्लेंड शक्ति, 0-100 (high-pass) |
| `kernelSize` | number | 3x3 / 5x5 कर्नेल के लिए `3` या `5` (high-pass) |
| `denoise` | string | नॉइज़ न्यूनीकरण प्री-पास: `off`, `light`, `medium`, या `strong` |

पैरामीटर विधि-विशिष्ट हैं। केवल चुनी गई विधि से संबंधित पैरामीटर ही आपूर्ति करें।

### color-blindness {#color-blindness}

एक 3x3 रंग-पुनर्संयोजन मैट्रिक्स का उपयोग करके एक रंग दृष्टि कमी का अनुकरण करें।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `type` | string | इनमें से एक: `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

पूरे ब्लॉक को हटाए बिना व्यक्तिगत EXIF/IPTC मेटाडेटा फ़ील्ड लिखें या हटाएँ।

| पैरामीटर | प्रकार | विवरण |
|---|---|---|
| `artist` | string | EXIF Artist टैग |
| `copyright` | string | EXIF Copyright टैग |
| `imageDescription` | string | EXIF ImageDescription टैग |
| `software` | string | EXIF Software टैग |
| `dateTime` | string | EXIF DateTime टैग |
| `dateTimeOriginal` | string | EXIF DateTimeOriginal टैग |
| `clearGps` | boolean | सभी GPS टैग हटाएँ |
| `fieldsToRemove` | string[] | हटाने के लिए EXIF फ़ील्ड नामों की सूची |

सभी पैरामीटर वैकल्पिक हैं। `fieldsToRemove` में सूचीबद्ध फ़ील्ड मौजूदा EXIF ब्लॉक से हटा दिए जाते हैं। नामित पैरामीटर के माध्यम से सेट किए गए फ़ील्ड लिखे (या अधिलेखित) जाते हैं। MakerNote जैसी बाइनरी/असुरक्षित कुंजियाँ चुपचाप अनदेखी कर दी जाती हैं।

## फ़ॉर्मेट पहचान {#format-detection}

इंजन केवल फ़ाइल एक्सटेंशन से नहीं, बल्कि फ़ाइल हेडर से इनपुट फ़ॉर्मेट स्वतः पहचानता है। इसका अर्थ है कि एक `.jpg` फ़ाइल जो वास्तव में एक PNG है, सही ढंग से संभाली जाएगी। पहचान एक बहु-परत दृष्टिकोण का उपयोग करती है: पहले मैजिक बाइट्स, फिर फ़ॉलबैक के रूप में फ़ाइल एक्सटेंशन।

SnapOtter **55+ इनपुट फ़ॉर्मेट** और **13 आउटपुट फ़ॉर्मेट** का समर्थन करता है, जिसमें 20+ ब्रांडों के 23 कैमरा RAW फ़ॉर्मेट, पेशेवर फ़ॉर्मेट (PSD, EPS, OpenEXR, HDR), आधुनिक कोडेक (JPEG XL, AVIF, HEIC, QOI, JPEG 2000), और वैज्ञानिक/गेमिंग फ़ॉर्मेट (FITS, DDS) शामिल हैं। डिकोडिंग जहाँ संभव हो Sharp द्वारा मूल रूप से संभाली जाती है, ImageMagick, LibRaw, और विशेष CLI डिकोडर के स्वचालित फ़ॉलबैक के साथ।

पूरी सूची के लिए [समर्थित फ़ॉर्मेट](/hi/guide/supported-formats) पृष्ठ देखें।

## मेटाडेटा निष्कर्षण {#metadata-extraction}

`info` टूल इमेज मेटाडेटा लौटाता है। पूर्ण फ़ील्ड संदर्भ के लिए [Image Info](/hi/tools/image/info) देखें।

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
