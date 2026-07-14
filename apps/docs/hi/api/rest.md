---
description: "संपूर्ण REST API संदर्भ। टूल एंडपॉइंट, बैच प्रोसेसिंग, पाइपलाइन, फ़ाइल लाइब्रेरी, प्रमाणीकरण, टीमें और एडमिन संचालन।"
i18n_output_hash: 40efba210bee
i18n_source_hash: b89b5df16af5
i18n_provenance: human
---

# REST API संदर्भ {#rest-api-reference}

अनुरोध/प्रतिक्रिया उदाहरणों के साथ इंटरैक्टिव API डॉक्स [http://localhost:1349/api/docs](http://localhost:1349/api/docs) पर उपलब्ध हैं।

मशीन-पठनीय विनिर्देश:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 विनिर्देश
- `/llms.txt` - LLM-अनुकूल सारांश
- `/llms-full.txt` - संपूर्ण LLM-अनुकूल डॉक्स

## प्रमाणीकरण {#authentication}

जब तक `AUTH_ENABLED=false` न हो, सभी एंडपॉइंट के लिए प्रमाणीकरण आवश्यक है।

### सेशन टोकन {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

सेशन 7 दिनों के बाद समाप्त हो जाते हैं (`SESSION_DURATION_HOURS` के माध्यम से कॉन्फ़िगर करने योग्य)।

### API कीज़ {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

कीज़ के आगे `si_` उपसर्ग लगा होता है और उन्हें scrypt हैश के रूप में संग्रहीत किया जाता है - कच्ची की एक बार दिखाई जाती है और फिर कभी पुनः प्राप्त नहीं की जा सकती।

### प्रमाणीकरण एंडपॉइंट {#auth-endpoints}

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | सार्वजनिक | लॉगिन, सेशन टोकन प्राप्त करें |
| `POST` | `/api/auth/logout` | प्रमाणित | वर्तमान सेशन नष्ट करें |
| `GET` | `/api/auth/session` | प्रमाणित | वर्तमान सेशन सत्यापित करें |
| `POST` | `/api/auth/change-password` | प्रमाणित | अपना पासवर्ड बदलें (अन्य सभी सेशन + API कीज़ अमान्य कर देता है) |
| `GET` | `/api/auth/users` | एडमिन | सभी उपयोगकर्ताओं की सूची बनाएँ |
| `POST` | `/api/auth/register` | एडमिन | एक नया उपयोगकर्ता बनाएँ |
| `PUT` | `/api/auth/users/:id` | एडमिन | उपयोगकर्ता की भूमिका या टीम अपडेट करें |
| `POST` | `/api/auth/users/:id/reset-password` | एडमिन | उपयोगकर्ता का पासवर्ड रीसेट करें |
| `DELETE` | `/api/auth/users/:id` | एडमिन | एक उपयोगकर्ता हटाएँ |
| `GET` | `/api/v1/config/auth` | सार्वजनिक | जाँचें कि प्रमाणीकरण सक्षम है या नहीं (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | प्रमाणित | TOTP MFA नामांकन शुरू करें। एंटरप्राइज़ `mfa` फ़ीचर आवश्यक है |
| `POST` | `/api/auth/mfa/verify` | प्रमाणित | TOTP कोड के साथ MFA नामांकन की पुष्टि करें |
| `POST` | `/api/auth/mfa/complete` | सार्वजनिक | एक लंबित MFA लॉगिन चुनौती पूरी करें |
| `POST` | `/api/auth/mfa/disable` | प्रमाणित | वर्तमान उपयोगकर्ता के लिए MFA अक्षम करें |
| `POST` | `/api/auth/users/:id/mfa/reset` | एडमिन (`users:manage`) | एक उपयोगकर्ता के लिए MFA रीसेट करें |
| `GET` | `/api/auth/oidc/login` | सार्वजनिक | OIDC सक्षम होने पर OIDC लॉगिन शुरू करें |
| `GET` | `/api/auth/oidc/callback` | सार्वजनिक | OIDC प्राधिकरण कॉलबैक |
| `GET` | `/api/auth/saml/metadata` | सार्वजनिक | SAML सक्षम होने पर SAML SP मेटाडेटा XML |
| `GET` | `/api/auth/saml/login` | सार्वजनिक | SAML लॉगिन शुरू करें |
| `POST` | `/api/auth/saml/callback` | सार्वजनिक | SAML असर्शन कंज़्यूमर सर्विस |

जब किसी उपयोगकर्ता के लिए MFA सक्षम होता है, तो `POST /api/auth/login` सेशन टोकन के बजाय `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` लौटाता है। उस `mfaToken` के साथ एक TOTP या रिकवरी कोड `/api/auth/mfa/complete` को भेजें।

### अनुमतियाँ {#permissions}

| अनुमति | एडमिन | उपयोगकर्ता |
|-----------|:-----:|:----:|
| टूल का उपयोग करें | ✓ | ✓ |
| अपनी फ़ाइलें/पाइपलाइन/API कीज़ | ✓ | ✓ |
| सभी उपयोगकर्ताओं की फ़ाइलें/पाइपलाइन/कीज़ देखें | ✓ | - |
| सेटिंग्स लिखें | ✓ | - |
| उपयोगकर्ता और टीमें प्रबंधित करें | ✓ | - |
| ब्रांडिंग प्रबंधित करें | ✓ | - |

## हेल्थ चेक {#health-check}

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | सार्वजनिक | बुनियादी हेल्थ चेक। 200 के साथ `{"status":"healthy","version":"..."}` लौटाता है, या डेटाबेस अगम्य होने पर 503 के साथ `{"status":"unhealthy"}`। |
| `GET` | `/api/v1/readyz` | सार्वजनिक | रेडीनेस प्रोब। कॉन्फ़िगर होने पर PostgreSQL, Redis, डिस्क स्थान और S3 की जाँच करता है। जब इंस्टेंस को ट्रैफ़िक प्राप्त नहीं करना चाहिए तब 503 लौटाता है। |
| `GET` | `/api/v1/admin/health` | एडमिन (`system:health`) | अपटाइम, स्टोरेज मोड, डेटाबेस स्थिति, क्यू स्थिति और GPU उपलब्धता सहित विस्तृत निदान। |

## टूल का उपयोग {#using-tools}

हर टूल एक ही पैटर्न का पालन करता है:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` इनमें से एक है: `image`, `video`, `audio`, `pdf`, या `files`।

- अपलोड `multipart/form-data` है।
- `settings` टूल-विशिष्ट विकल्पों वाला एक JSON स्ट्रिंग है।
- `clientJobId` कॉलर-प्रदत्त प्रगति सहसंबंध के लिए एक वैकल्पिक फ़ॉर्म फ़ील्ड है।
- `fileId` एक मौजूदा फ़ाइल लाइब्रेरी आइटम को संदर्भित करने वाला एक वैकल्पिक फ़ॉर्म फ़ील्ड है। मौजूद होने पर, संसाधित आउटपुट एक नए संस्करण के रूप में सहेजा जाता है और प्रतिक्रिया में `savedFileId` शामिल होता है।
- **तेज़ टूल** आमतौर पर 200 JSON लौटाते हैं: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`। संसाधित फ़ाइल `downloadUrl` से प्राप्त करें।
- **कोई भी क्यू किया गया टूल** 202 JSON लौटा सकता है यदि वह लंबे समय तक चलने वाला हो या समकालिक प्रतीक्षा विंडो से अधिक हो: `{"jobId":"...","async":true}`। प्रगति के लिए SSE से कनेक्ट करें, फिर पूरा होने पर डाउनलोड करें ([प्रगति ट्रैकिंग](#progress-tracking) देखें)।
- **बैच** रूट सामान्य बैच रजिस्ट्री में पंजीकृत टूल के लिए सीधे स्ट्रीम किया गया एक ZIP संग्रह (`X-Job-Id` हेडर के साथ) लौटाते हैं।

## टूल संदर्भ {#tools-reference}

### कन्वर्ज़न प्रीसेट {#conversion-presets}

साझा कैटलॉग में 83 समर्पित कन्वर्ज़न प्रीसेट एंडपॉइंट शामिल हैं, जैसे `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, और `excel-to-csv`। प्रीसेट प्रथम-श्रेणी के टूल रूट हैं:

`POST /api/v1/tools/<section>/<presetId>`

प्रत्येक प्रीसेट आउटपुट फ़ॉर्मेट को लॉक करता है और किसी बेस टूल को सौंपता है, जैसे `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, या `convert-spreadsheet`। संपूर्ण रूट तालिका और वैकल्पिक सेटिंग्स के लिए [कन्वर्ज़न प्रीसेट](/hi/tools/conversion-presets) देखें।

### आवश्यक चीज़ें {#essentials}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `resize` | रीसाइज़ | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, साथ ही 23 सोशल मीडिया प्रीसेट |
| `crop` | क्रॉप | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | रोटेट और फ़्लिप | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | कन्वर्ट | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | कम्प्रेस | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### ऑप्टिमाइज़ेशन {#optimization}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `optimize-for-web` | वेब के लिए ऑप्टिमाइज़ करें | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | मेटाडेटा हटाएँ | - |
| `edit-metadata` | मेटाडेटा संपादित करें | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | बल्क रीनेम | `pattern` (`{n}`, `{date}`, `{original}` का समर्थन करता है), `startIndex`, `padding` |
| `image-to-pdf` | इमेज से PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | फ़ेविकॉन जेनरेटर | `padding`, `backgroundColor`, `borderRadius` - सभी मानक आकार जेनरेट करता है |

### समायोजन {#adjustments}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `adjust-colors` | रंग समायोजित करें | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | शार्पनिंग | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | रंग बदलें | `sourceColor`, `targetColor` (प्रतिस्थापन), `makeTransparent`, `tolerance` |
| `color-blindness` | रंग अंधता सिमुलेशन | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, डिफ़ॉल्ट "deuteranomaly") |
| `duotone` | डुओटोन | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | पिक्सलेट | `blockSize` (2-128), `region` (आंशिक पिक्सलेशन के लिए {left, top, width, height}) |
| `vignette` | विनयेट | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI टूल {#ai-tools}

सभी AI टूल आपके हार्डवेयर पर चलते हैं: डिफ़ॉल्ट रूप से CPU पर, या समर्थित NVIDIA GPU उपलब्ध होने पर NVIDIA CUDA पर। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU एक्सेलरेशन आज AI इन्फ़रेंस के लिए समर्थित नहीं है। कोई इंटरनेट आवश्यक नहीं है।

| टूल ID | नाम | AI मॉडल | मुख्य सेटिंग्स |
|---------|------|---------|-------------|
| `remove-background` | बैकग्राउंड हटाएँ | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | इमेज अपस्केलिंग | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | ऑब्जेक्ट इरेज़र | LaMa (ONNX) | मास्क दूसरे फ़ाइल भाग के रूप में भेजा जाता है (फ़ील्डनाम `mask`), `format`, `quality` |
| `ocr` | OCR / टेक्स्ट एक्सट्रैक्शन | Tesseract (तेज़); RapidOCR + PP-OCR ONNX (संतुलित/सर्वोत्तम) | `quality` (तेज़/संतुलित/सर्वोत्तम), `language`, `enhance` |
| `blur-faces` | फ़ेस / PII ब्लर | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | स्मार्ट क्रॉप | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | इमेज एन्हांसमेंट | विश्लेषण-आधारित | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | फ़ेस एन्हांसमेंट | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI रंगकरण | DDColor | `intensity`, `model` |
| `noise-removal` | नॉइज़ हटाएँ | स्तरीय डीनॉइज़िंग | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | रेड आई हटाएँ | फ़ेस लैंडमार्क + रंग विश्लेषण | `sensitivity`, `strength` |
| `restore-photo` | फ़ोटो रीस्टोरेशन | बहु-चरण पाइपलाइन | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | पासपोर्ट फ़ोटो | MediaPipe लैंडमार्क | दो-चरण प्रवाह। विश्लेषण मल्टीपार्ट `file` का उपयोग करता है; जेनरेट JSON का उपयोग करता है, जिसमें `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), लैंडमार्क, इमेज आयाम होते हैं |
| `content-aware-resize` | कंटेंट-अवेयर रीसाइज़ | सीम कार्विंग (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG ट्रांसपेरेंसी फ़िक्सर | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | बैकग्राउंड बदलें | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | बैकग्राउंड ब्लर करें | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI कैनवास विस्तार | LaMa (आउटपेंटिंग) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### वॉटरमार्क और ओवरले {#watermark-overlay}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `watermark-text` | टेक्स्ट वॉटरमार्क | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | इमेज वॉटरमार्क | `opacity`, `position`, `scale` - दूसरी फ़ाइल वॉटरमार्क है |
| `text-overlay` | टेक्स्ट ओवरले | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | इमेज कंपोज़िशन | `x`, `y`, `opacity`, `blend` - दूसरी फ़ाइल ऊपर लेयर की जाती है |
| `meme-generator` | मीम जेनरेटर | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`। टेम्पलेट मोड (`templateId` के साथ JSON बॉडी) या कस्टम इमेज मोड (फ़ाइल के साथ मल्टीपार्ट) का समर्थन करता है। |

### उपयोगिताएँ {#utilities}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `info` | इमेज जानकारी | - (width, height, format, size, channels, hasAlpha, DPI, EXIF लौटाता है) |
| `compare` | इमेज तुलना | `mode` (side-by-side/overlay/diff), `diffThreshold` - दूसरी फ़ाइल तुलना लक्ष्य है |
| `find-duplicates` | डुप्लिकेट खोजें | `threshold` (perceptual hash दूरी, डिफ़ॉल्ट 8) - मल्टी-फ़ाइल |
| `color-palette` | रंग पैलेट | `count` (प्रमुख रंग गिनती), `format` (hex/rgb) |
| `qr-generate` | QR कोड जेनरेटर | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (वैकल्पिक फ़ाइल) |
| `barcode-read` | बारकोड रीडर | - (QR, EAN, Code128, DataMatrix आदि को स्वतः पहचानता है) |
| `image-to-base64` | इमेज से Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML से इमेज | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | हिस्टोग्राम | `scale` (linear/log) - RGB हिस्टोग्राम चार्ट + प्रति-चैनल आँकड़े लौटाता है |
| `lqip-placeholder` | LQIP प्लेसहोल्डर | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | बारकोड जेनरेटर | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool)। JSON बॉडी, कोई फ़ाइल अपलोड नहीं। |

### लेआउट और कंपोज़िशन {#layout-composition}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `collage` | कोलाज / ग्रिड | `template` (25+ लेआउट), `gap`, `backgroundColor`, `borderRadius` - मल्टी-फ़ाइल |
| `stitch` | स्टिच / कम्बाइन | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - मल्टी-फ़ाइल |
| `split` | इमेज स्प्लिटिंग | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | बॉर्डर और फ़्रेम | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | स्क्रीनशॉट सुंदर बनाएँ | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | सर्कल क्रॉप | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | इमेज पैड | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | स्प्राइट शीट | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - मल्टी-फ़ाइल (2-64 इमेज) |

### फ़ॉर्मेट और कन्वर्ज़न {#format-conversion}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `svg-to-raster` | SVG से रास्टर | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | इमेज से SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF टूल | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), क्रिया-विशिष्ट पैरामीटर |
| `gif-webp` | GIF/WebP कन्वर्टर | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### वीडियो टूल {#video-tools}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `convert-video` | वीडियो कन्वर्ट करें | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | वीडियो कम्प्रेस करें | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | वीडियो ट्रिम करें | `startS`, `endS`, `precise` (bool, फ़्रेम-सटीक कट) |
| `mute-video` | वीडियो म्यूट करें | - |
| `video-to-gif` | वीडियो से GIF | `fps` (1-30), `width`, `startS`, `durationS` (अधिकतम 60s) |
| `resize-video` | वीडियो रीसाइज़ करें | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | वीडियो क्रॉप करें | `width`, `height`, `x`, `y` |
| `rotate-video` | वीडियो रोटेट करें | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | FPS बदलें | `fps` (1-120) |
| `video-color` | वीडियो रंग | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | वीडियो गति | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | वीडियो रिवर्स करें | - (अधिकतम 5 मिनट) |
| `video-loudnorm` | ऑडियो नॉर्मलाइज़ करें | - (EBU R128) |
| `aspect-pad` | एस्पेक्ट पैड | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | ब्लर पैड | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | वीडियो वॉटरमार्क करें | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | वीडियो स्थिर करें | `smoothing` (5-60, फ़्रेम में) |
| `gif-to-video` | GIF से वीडियो | `format` (mp4/webm/mov) |
| `video-to-webp` | वीडियो से WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | वीडियो से फ़्रेम | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | वीडियो मर्ज करें | - (मल्टी-फ़ाइल, पहले वीडियो के रिज़ॉल्यूशन पर नॉर्मलाइज़्ड) |
| `replace-audio` | ऑडियो बदलें | - (वीडियो + ऑडियो फ़ाइल, दो फ़ाइलें) |
| `burn-subtitles` | सबटाइटल बर्न करें | `fontSize` (8-72) - वीडियो + सबटाइटल फ़ाइल |
| `embed-subtitles` | सबटाइटल एम्बेड करें | `language` (ISO 639-2/B कोड) - वीडियो + सबटाइटल फ़ाइल |
| `extract-subtitles` | सबटाइटल निकालें | - (SRT आउटपुट करता है) |
| `images-to-video` | इमेज से वीडियो | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - मल्टी-फ़ाइल |
| `video-metadata` | वीडियो मेटाडेटा साफ़ करें | - |
| `auto-subtitles` | ऑटो सबटाइटल (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | ऑडियो निकालें | `format` (mp3/wav/m4a/ogg) |

### ऑडियो टूल {#audio-tools}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `convert-audio` | ऑडियो कन्वर्ट करें | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | ऑडियो ट्रिम करें | `startS`, `endS` |
| `volume-adjust` | वॉल्यूम समायोजित करें | `gainDb` (-30 से 30) |
| `normalize-audio` | ऑडियो नॉर्मलाइज़ करें | - (EBU R128, -16 LUFS) |
| `fade-audio` | ऑडियो फ़ेड करें | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | ऑडियो रिवर्स करें | - |
| `audio-speed` | ऑडियो गति | `factor` (0.25-4) |
| `pitch-shift` | पिच शिफ़्ट | `semitones` (-12 से 12) |
| `audio-channels` | ऑडियो चैनल | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | साइलेंस हटाएँ | `thresholdDb` (-80 से -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | नॉइज़ कमी | `strength` (light/medium/strong) |
| `merge-audio` | ऑडियो मर्ज करें | `format` (mp3/wav/flac/m4a) - मल्टी-फ़ाइल |
| `split-audio` | ऑडियो स्प्लिट करें | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | रिंगटोन मेकर | `startS`, `durationS` (1-30) |
| `waveform-image` | वेवफ़ॉर्म इमेज | `width`, `height`, `color` (hex) |
| `audio-metadata` | ऑडियो मेटाडेटा | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | ऑडियो ट्रांसक्राइब करें (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### डॉक्यूमेंट टूल {#document-tools}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `merge-pdf` | PDF मर्ज करें | - (मल्टी-फ़ाइल, 20 PDF तक) |
| `split-pdf` | PDF स्प्लिट करें | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | PDF कम्प्रेस करें | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | PDF रोटेट करें | `angle` (90/180/270), `range` (पेज रेंज) |
| `extract-pages` | पेज निकालें | `range` (qpdf सिंटैक्स, जैसे "1-5,8,10-z") |
| `remove-pages` | पेज हटाएँ | `pages` (हटाने के लिए qpdf रेंज) |
| `organize-pdf` | PDF व्यवस्थित करें | `order` (qpdf पेज क्रम, जैसे "3,1,2,5-z") |
| `protect-pdf` | PDF सुरक्षित करें | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | PDF अनलॉक करें | `password` |
| `repair-pdf` | PDF रिपेयर करें | - |
| `linearize-pdf` | PDF वेब-ऑप्टिमाइज़ करें | - (तेज़ वेब देखने के लिए लीनियराइज़) |
| `grayscale-pdf` | PDF ग्रेस्केल | - |
| `pdfa-convert` | PDF/A कन्वर्ट | - (आर्काइवल PDF/A-2) |
| `crop-pdf` | PDF क्रॉप करें | `margin` (0-2000 पॉइंट) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | बुकलेट PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | PDF वॉटरमार्क करें | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF पेज नंबर | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | PDF फ़्लैटन करें | - (फ़ॉर्म और एनोटेशन बेक करता है) |
| `redact-pdf` | PDF रीडैक्ट करें | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | PDF साइन करें | PDF `file`, सिग्नेचर फ़ाइलें `sig0`, `sig1`, और `placements` JSON ऐरे के साथ कस्टम मल्टीपार्ट रूट |
| `pdf-to-text` | PDF से टेक्स्ट | - |
| `pdf-to-word` | PDF से Word | - |
| `pdf-metadata` | PDF मेटाडेटा | `title`, `author`, `subject`, `keywords` |
| `convert-document` | डॉक्यूमेंट कन्वर्ट करें | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | प्रेज़ेंटेशन कन्वर्ट करें | `format` (pptx/odp) |
| `convert-spreadsheet` | स्प्रेडशीट कन्वर्ट करें | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel से PDF | - |
| `word-to-pdf` | Word से PDF | - |
| `powerpoint-to-pdf` | PowerPoint से PDF | - |
| `html-to-pdf` | HTML से PDF | - (रिमोट संसाधन अक्षम) |
| `markdown-to-docx` | Markdown से Word | - |
| `markdown-to-html` | Markdown से HTML | - |
| `markdown-to-pdf` | Markdown से PDF | - (रिमोट संसाधन अक्षम) |
| `epub-convert` | EPUB कन्वर्ट करें | `format` (pdf/docx/html/md) |
| `to-epub` | EPUB में कन्वर्ट करें | - (.docx, .md, .html, .txt स्वीकार करता है) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF से इमेज | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF से JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF से PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF से TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### फ़ाइल टूल {#file-tools}

| टूल ID | नाम | मुख्य सेटिंग्स |
|---------|------|-------------|
| `chart-maker` | चार्ट मेकर | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV से Excel | `sheet` (XLSX इनपुट के लिए वर्कशीट संख्या) - द्विदिशात्मक |
| `csv-json` | CSV से JSON | `pretty` (bool) - द्विदिशात्मक |
| `json-xml` | JSON से XML | `pretty` (bool) - द्विदिशात्मक |
| `split-csv` | CSV स्प्लिट करें | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | CSV मर्ज करें | - (मल्टी-फ़ाइल, मेल खाते कॉलम) |
| `yaml-json` | YAML / JSON | - (द्विदिशात्मक) |
| `xml-to-csv` | XML से CSV | - (दोहराए जाने वाले तत्व स्वतः खोजता है) |
| `excel-to-csv` | Excel से CSV | `convert-spreadsheet` द्वारा समर्थित समर्पित कन्वर्ज़न प्रीसेट |
| `create-zip` | ZIP बनाएँ | - (मल्टी-फ़ाइल, 2-50 फ़ाइलें) |
| `extract-zip` | ZIP निकालें | - (bomb-संरक्षित) |

### HTML से इमेज {#html-to-image}

एक वेबपेज को इमेज के रूप में कैप्चर करें। अन्य टूल के विपरीत, यह एंडपॉइंट मल्टीपार्ट फ़ॉर्म डेटा के बजाय `application/json` स्वीकार करता है (किसी फ़ाइल अपलोड की आवश्यकता नहीं)।

**एंडपॉइंट:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `url` | string | (आवश्यक) | कैप्चर करने के लिए URL (केवल http/https) |
| `format` | string | `"png"` | आउटपुट फ़ॉर्मेट: `jpg`, `png`, `webp` |
| `quality` | number | `90` | गुणवत्ता 1-100 (केवल JPG/WebP) |
| `fullPage` | boolean | `false` | पूरा स्क्रॉल करने योग्य पेज कैप्चर करें |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | कस्टम व्यूपोर्ट चौड़ाई 320-3840 |
| `viewportHeight` | number | `720` | कस्टम व्यूपोर्ट ऊँचाई 320-2160 |

**उदाहरण:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**प्रतिक्रिया:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### टूल सब-रूट {#tool-sub-routes}

कुछ टूल मानक `POST /api/v1/tools/<section>/<toolId>` से परे अतिरिक्त एंडपॉइंट प्रदान करते हैं:

| मेथड | पथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | लोकप्रिय टूल ID लौटाएँ, उपयोग डेटा विरल होने पर एक क्यूरेटेड डिफ़ॉल्ट सूची पर वापस आते हुए |
| `POST` | `/api/v1/tools/image/remove-background/effects` | AI को फिर से चलाए बिना बैकग्राउंड प्रभाव (color/gradient/blur/shadow) लागू करें। प्रारंभिक हटाने से कैश किया गया मास्क उपयोग करता है। |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | किसी इमेज से मौजूदा EXIF/IPTC/XMP मेटाडेटा पढ़ें |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | हटाने से पहले मेटाडेटा फ़ील्ड्स की जाँच करें |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | चरण 1: AI फ़ेस डिटेक्शन + बैकग्राउंड हटाना। फ़ेस लैंडमार्क और कैश किया गया डेटा लौटाता है। |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | चरण 2: कैश किए गए विश्लेषण का उपयोग करके क्रॉप, रीसाइज़ और टाइल करें। कोई AI पुनः-रन नहीं। |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF मेटाडेटा प्राप्त करें (फ़्रेम गिनती, आयाम, अवधि) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF मेटाडेटा प्राप्त करें (पेज गिनती, आयाम) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | किसी विशिष्ट PDF पेज का प्रीव्यू जेनरेट करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | समर्पित JPG प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | एक JPG प्रीसेट PDF पेज प्रीव्यू जेनरेट करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | समर्पित PNG प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | एक PNG प्रीसेट PDF पेज प्रीव्यू जेनरेट करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | समर्पित TIFF प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | एक TIFF प्रीसेट PDF पेज प्रीव्यू जेनरेट करें |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | कई SVG को बैच में रास्टर में कन्वर्ट करें |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | इमेज गुणवत्ता का विश्लेषण करें और एन्हांसमेंट अनुशंसाएँ लौटाएँ |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | लाइव पैरामीटर ट्यूनिंग के लिए हल्का प्रीव्यू। साइज़ हेडर के साथ ऑप्टिमाइज़्ड इमेज लौटाता है। |

## बैच प्रोसेसिंग {#batch-processing}

एक सामान्य बैच-सक्षम टूल को एक साथ कई फ़ाइलों पर लागू करें। एक ZIP संग्रह लौटाता है। कस्टम मल्टी-फ़ाइल या मल्टी-स्टेप रूट, जैसे PDF साइनिंग और PDF-से-इमेज प्रीसेट रूट, सामान्य `/batch` रूट के बजाय अपना स्वयं का एंडपॉइंट अनुबंध उपयोग करते हैं।

`ocr-pdf` टूल इस सामान्य `/batch` रूट का समर्थन करता है।

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

समानांतरता `CONCURRENT_JOBS` द्वारा नियंत्रित होती है (डिफ़ॉल्ट: CPU कोर से स्वतः पहचाना जाता है)। `MAX_BATCH_SIZE` प्रति बैच फ़ाइलों की संख्या सीमित करता है (डिफ़ॉल्ट: 100; असीमित के लिए 0 सेट करें)।

## पाइपलाइन {#pipelines}

### एक पाइपलाइन निष्पादित करें {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

हर चरण का आउटपुट अगले चरण का इनपुट होता है। पाइपलाइन डिफ़ॉल्ट रूप से 20 चरणों की अनुमति देती हैं, जो `MAX_PIPELINE_STEPS` के माध्यम से कॉन्फ़िगर करने योग्य है। सीमा हटाने के लिए `MAX_PIPELINE_STEPS=0` सेट करें।

### पाइपलाइन सहेजें और प्रबंधित करें {#save-and-manage-pipelines}

| मेथड | पथ | विवरण |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | एक नामित पाइपलाइन सहेजें (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | सहेजी गई पाइपलाइन की सूची बनाएँ (एडमिन सभी देखते हैं; उपयोगकर्ता अपनी देखते हैं) |
| `DELETE` | `/api/v1/pipeline/:id` | हटाएँ (मालिक या एडमिन) |
| `GET` | `/api/v1/pipeline/tools` | पाइपलाइन चरणों के लिए मान्य टूल ID की सूची बनाएँ |

## प्रगति ट्रैकिंग {#progress-tracking}

लंबे समय तक चलने वाले जॉब, क्यू किए गए टूल, बैच जॉब, और पाइपलाइन Server-Sent Events के माध्यम से रीयल-टाइम प्रगति उत्सर्जित करते हैं। प्रगति स्ट्रीम सार्वजनिक है और जॉब ID द्वारा कीड है, इसलिए क्लाइंट को इसे पढ़ने के लिए Authorization हेडर भेजने की आवश्यकता नहीं है।

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

इवेंट फ़ॉर्मेट:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

आप `POST /api/v1/jobs/:jobId/cancel` के साथ किसी क्यू किए गए या चल रहे जॉब के लिए रद्दीकरण का अनुरोध कर सकते हैं। प्रतिक्रिया `{"canceled":true|false}` है।

## फ़ाइल लाइब्रेरी {#file-library}

संस्करण इतिहास के साथ स्थायी फ़ाइल संग्रहण।

| मेथड | पथ | विवरण |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | वर्कस्पेस में फ़ाइलें अपलोड करें (अस्थायी प्रोसेसिंग) |
| `POST` | `/api/v1/files/upload` | स्थायी फ़ाइल लाइब्रेरी में फ़ाइलें अपलोड करें |
| `POST` | `/api/v1/files/save-result` | किसी टूल प्रोसेसिंग परिणाम को एक नए फ़ाइल संस्करण के रूप में सहेजें |
| `GET` | `/api/v1/files` | सहेजी गई फ़ाइलों की सूची बनाएँ (पृष्ठांकित, खोज के साथ) |
| `GET` | `/api/v1/files/:id` | फ़ाइल मेटाडेटा + संस्करण श्रृंखला प्राप्त करें |
| `GET` | `/api/v1/files/:id/download` | फ़ाइल डाउनलोड करें |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px JPEG थंबनेल प्राप्त करें |
| `DELETE` | `/api/v1/files` | फ़ाइलें और उनकी संस्करण श्रृंखलाएँ बल्क में हटाएँ (बॉडी: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | URL-आधारित आयात के लिए रिमोट URL को वर्कस्पेस में लाएँ |
| `POST` | `/api/v1/preview` | एक ब्राउज़र-संगत WebP प्रीव्यू जेनरेट करें (HEIC/HEIF/RAW फ़ॉर्मेट के लिए) |
| `GET` | `/api/v1/files/:id/preview` | किसी सहेजी गई PDF, ऑफ़िस डॉक्यूमेंट, वीडियो, या ऑडियो फ़ाइल के लिए कैश किया गया या जेनरेट किया गया ब्राउज़र-संगत प्रीव्यू स्ट्रीम करें |
| `POST` | `/api/v1/preview/generate` | अपलोड की गई मीडिया फ़ाइल के लिए पहले सहेजे बिना एक ऑन-डिमांड MP4 या MP3 प्रीव्यू जेनरेट करें |
| `GET` | `/api/v1/download/:jobId/:filename` | किसी वर्कस्पेस से एक संसाधित फ़ाइल डाउनलोड करें |

किसी टूल परिणाम को लाइब्रेरी में स्वतः सहेजने के लिए, किसी मौजूदा लाइब्रेरी फ़ाइल को संदर्भित करने वाले एक मल्टीपार्ट फ़ॉर्म फ़ील्ड के रूप में `fileId` शामिल करें। संसाधित परिणाम एक नए संस्करण के रूप में सहेजा जाएगा।

## API की प्रबंधन {#api-key-management}

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | प्रमाणित | नई की जेनरेट करें - एक बार दिखाई जाती है |
| `GET` | `/api/v1/api-keys` | प्रमाणित | कीज़ की सूची बनाएँ (name, id, lastUsedAt - कच्ची की नहीं) |
| `DELETE` | `/api/v1/api-keys/:id` | प्रमाणित | की हटाएँ |

## टीमें {#teams}

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | एडमिन (`teams:manage`) | टीमों की सूची बनाएँ |
| `POST` | `/api/v1/teams` | एडमिन (`teams:manage`) | टीम बनाएँ |
| `PUT` | `/api/v1/teams/:id` | एडमिन (`teams:manage`) | टीम का नाम बदलें |
| `DELETE` | `/api/v1/teams/:id` | एडमिन (`teams:manage`) | टीम हटाएँ (डिफ़ॉल्ट टीम या सदस्यों वाली टीमें नहीं हटा सकते) |

## सेटिंग्स {#settings}

रनटाइम की-वैल्यू कॉन्फ़िगरेशन (किसी भी प्रमाणित उपयोगकर्ता द्वारा पढ़ी जाती है, केवल एडमिन द्वारा लिखी जाती है)।

| मेथड | पथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | सभी सेटिंग्स प्राप्त करें |
| `PUT` | `/api/v1/settings` | सेटिंग्स बल्क में अपडेट करें (की-वैल्यू जोड़ों के साथ JSON बॉडी) |
| `GET` | `/api/v1/settings/:key` | की के आधार पर एक विशिष्ट सेटिंग प्राप्त करें |

ज्ञात कीज़: `disabledTools` (टूल ID का JSON ऐरे), `enableExperimentalTools` (bool स्ट्रिंग), `loginAttemptLimit` (number)।

## प्राथमिकताएँ {#preferences}

प्रति-उपयोगकर्ता प्राथमिकताएँ इंस्टेंस सेटिंग्स से अलग हैं। कोई भी प्रमाणित उपयोगकर्ता अपने स्वयं के प्राथमिकता मानचित्र को पढ़ और अपडेट कर सकता है।

| मेथड | पथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | वर्तमान उपयोगकर्ता की प्राथमिकताएँ `{ "preferences": { ... } }` के रूप में प्राप्त करें |
| `PUT` | `/api/v1/preferences` | वर्तमान उपयोगकर्ता के लिए एक या अधिक प्राथमिकता कीज़ अपसर्ट करें |

## भूमिकाएँ {#roles}

विस्तृत अनुमतियों के साथ कस्टम भूमिका प्रबंधन।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | एडमिन (`audit:read`) | उपयोगकर्ता गिनती के साथ सभी भूमिकाओं की सूची बनाएँ |
| `POST` | `/api/v1/roles` | एडमिन (`security:manage`) | एक कस्टम भूमिका बनाएँ (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | एडमिन (`security:manage`) | एक कस्टम भूमिका अपडेट करें (अंतर्निहित भूमिकाओं को संशोधित नहीं कर सकते) |
| `DELETE` | `/api/v1/roles/:id` | एडमिन (`security:manage`) | एक कस्टम भूमिका हटाएँ (अंतर्निहित भूमिकाओं को नहीं हटा सकते; प्रभावित उपयोगकर्ता `user` भूमिका पर वापस आ जाते हैं) |

उपलब्ध अनुमतियाँ (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`।

## ऑडिट लॉग {#audit-log}

सुरक्षा-संबंधी क्रियाओं की समीक्षा के लिए केवल-एडमिन एंडपॉइंट।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | एडमिन (`audit:read`) | वैकल्पिक फ़िल्टर के साथ पृष्ठांकित ऑडिट लॉग |

क्वेरी पैरामीटर:

| पैरामीटर | विवरण |
|-----------|-------------|
| `page` | पेज संख्या (डिफ़ॉल्ट: 1) |
| `limit` | प्रति पेज प्रविष्टियाँ (डिफ़ॉल्ट: 50, अधिकतम: 100) |
| `action` | क्रिया प्रकार द्वारा फ़िल्टर करें (जैसे `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | स्रोत IP पते द्वारा फ़िल्टर करें |
| `from` | इस ISO 8601 तिथि के बाद की प्रविष्टियाँ फ़िल्टर करें |
| `to` | इस ISO 8601 तिथि से पहले की प्रविष्टियाँ फ़िल्टर करें |

## एनालिटिक्स {#analytics}

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | सार्वजनिक | प्रभावी एनालिटिक्स कॉन्फ़िगरेशन प्राप्त करें (PostHog की, Sentry DSN, सैंपल रेट)। जब एनालिटिक्स बंद हो, चाहे कंपाइल-टाइम बेक से हो या इंस्टेंस `analyticsEnabled` सेटिंग से, तब कीज़, DSN, और इंस्टेंस ID खाली रहते हैं। |
| `POST` | `/api/v1/feedback` | प्रमाणित | कॉन्फ़िगर किए गए PostHog प्रोजेक्ट में स्पष्ट उपयोगकर्ता फ़ीडबैक `feedback_submitted` के रूप में सबमिट करें। यह रूट एनालिटिक्स गेट का सम्मान करता है, सबमिशन को रेट-लिमिट करता है, जब तक `contactOk` true न हो तब तक संपर्क फ़ील्ड हटा देता है, और फ़ाइल सामग्री, फ़ाइल नाम, अपलोड पथ, या कच्चा निजी त्रुटि टेक्स्ट कभी स्वीकार नहीं करता। जब एनालिटिक्स अक्षम हो, तो यह `{ "ok": true, "accepted": false }` लौटाता है। |
| `PUT` | `/api/v1/settings` | एडमिन (`settings:write`) | इंस्टेंस-व्यापी ऑप्ट-आउट सेट करें। सभी के लिए एनालिटिक्स बंद करने हेतु एक JSON बॉडी `{ "analyticsEnabled": "false" }` भेजें, या इसे वापस चालू करने हेतु `"true"`। |

## फ़ीचर / AI बंडल {#features-ai-bundles}

AI फ़ीचर बंडल प्रबंधित करें (Docker वातावरण में AI मॉडल पैकेज इंस्टॉल/अनइंस्टॉल करें)। कस्टम ऑटोमेशन से किसी टूल को सक्षम करते समय टूल-स्तरीय इंस्टॉल एंडपॉइंट को प्राथमिकता दें: कुछ AI टूल को एक से अधिक साझा बंडल की आवश्यकता होती है, और यह एंडपॉइंट पहले से इंस्टॉल किए गए बंडल को छोड़ देता है और केवल गायब बंडल को क्यू करता है।

OCR एक कठिन निर्भरता के बजाय एक वैकल्पिक वृद्धि है। इसका `fast` Tesseract टियर बिना पैक के काम करता है; `POST /api/v1/admin/features/ocr/install` `balanced` और `best` के लिए Linux amd64 या arm64 पर हस्ताक्षरित RapidOCR पैक स्थापित करता है। सटीक OCR रनटाइम केवल CPU और NVIDIA होस्ट पर CPU का उपयोग करता है और इसके लिए कम से कम 4 GiB प्रभावी मेमोरी (कॉन्फ़िगर कंटेनर cgroup सीमा, अन्यथा होस्ट मेमोरी) की आवश्यकता होती है। SnapOtter `requiredMemoryBytes`, `effectiveMemoryBytes` और एक `insufficient-memory` संगतता कारण की रिपोर्ट करता है, और डाउनलोड से पहले एक असंगत इंस्टॉल को अस्वीकार कर देता है। यह मेमोरी आवश्यकता `fast` पर लागू नहीं होती है। लक्ष्य के आधार पर पैक को डाउनलोड करने के लिए लगभग 208-234 MiB और 409-488 MiB इंस्टॉल करना है; हस्ताक्षरित सूचकांक स्थापना के दौरान लागू किए गए सटीक आकारों को बांधता है।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | प्रमाणित | सभी फ़ीचर बंडल और उनकी इंस्टॉल स्थिति की सूची बनाएँ |
| `POST` | `/api/v1/admin/features/:bundleId/install` | एडमिन (`features:manage`) | एक फ़ीचर बंडल इंस्टॉल करें (async, प्रगति ट्रैकिंग के लिए `jobId` लौटाता है) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | एडमिन (`features:manage`) | किसी टूल के लिए आवश्यक हर बंडल इंस्टॉल करें; प्रति-बंडल queued/skipped स्थिति लौटाता है |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | एडमिन (`features:manage`) | एक फ़ीचर बंडल अनइंस्टॉल करें और मॉडल फ़ाइलें साफ़ करें |
| `GET` | `/api/v1/admin/features/disk-usage` | एडमिन (`features:manage`) | AI मॉडल का कुल डिस्क उपयोग प्राप्त करें |
| `POST` | `/api/v1/admin/features/import` | व्यवस्थापक (`features:manage`) | एक लीगेसी AI बंडल (`file`) या एक हस्ताक्षरित ऑफ़लाइन OCR रिलीज़ (`index` प्लस `archive`) आयात करें |

एक एयर-गैप्ड OCR आयात में रिलीज़ के हस्ताक्षरित `ocr-runtime-index.json` और मिलान प्लेटफ़ॉर्म संग्रह शामिल होना चाहिए। SnapOtter ऑनलाइन इंस्टॉलेशन द्वारा उपयोग किए जाने वाले समान Ed25519 हस्ताक्षर, आर्टिफैक्ट हैश, संगतता, निष्कर्षण और धुआं-परीक्षण जांच लागू करता है:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

arm64 पर `linux-arm64-cpu-py311` संग्रह का उपयोग करें। किसी अन्य लक्ष्य के लिए हस्ताक्षरित कलाकृति को स्थापित करने के बजाय अस्वीकार कर दिया जाता है।

## एडमिन संचालन {#admin-operations}

अवलोकनीयता, समर्थन, उपयोग रिपोर्टिंग, और बैकअप स्थिति के लिए संचालन एंडपॉइंट।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | एडमिन (`settings:write`) | वर्तमान रनटाइम लॉग स्तर पढ़ें |
| `POST` | `/api/v1/admin/log-level` | एडमिन (`settings:write`) | रनटाइम लॉग स्तर बदलें (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, या `silent`) |
| `GET` | `/api/v1/metrics` | एडमिन (`system:health`) | टेक्स्ट फ़ॉर्मेट में Prometheus मेट्रिक्स |
| `GET` | `/api/v1/admin/support-bundle` | एडमिन (`system:health`) | एक संपादित नैदानिक समर्थन बंडल ZIP डाउनलोड करें |
| `GET` | `/api/v1/admin/usage` | एडमिन (`audit:read`) | उपयोग डैशबोर्ड डेटा, वैकल्पिक `days` क्वेरी पैरामीटर के साथ |
| `GET` | `/api/v1/admin/backup-status` | एडमिन (`system:health`) | अंतिम बैकअप मेटाडेटा और ताज़गी स्थिति पढ़ें |
| `POST` | `/api/v1/admin/backup-status` | एडमिन (`system:health`) | एक पूर्ण बैकअप रिकॉर्ड करें (`type`, वैकल्पिक `sizeBytes`, वैकल्पिक `notes`) |

## एंटरप्राइज़ APIs {#enterprise-apis}

ये रूट अपने संबंधित एंटरप्राइज़ फ़ीचर द्वारा लाइसेंस-गेटेड हैं। इनके लिए अभी भी सूचीबद्ध SnapOtter अनुमति आवश्यक है।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | एडमिन (`audit:read`) | फ़िल्टर के साथ ऑडिट प्रविष्टियों को JSON या CSV के रूप में निर्यात करें |
| `GET` | `/api/v1/enterprise/config/export` | एडमिन (`system:health`) | संपादित इंस्टेंस कॉन्फ़िग, कस्टम भूमिकाएँ, और टीमें निर्यात करें |
| `POST` | `/api/v1/enterprise/config/import` | एडमिन (`system:health`) | कॉन्फ़िग आयात करें, वैकल्पिक ड्राई रन के साथ |
| `GET` | `/api/v1/enterprise/ip-allowlist` | एडमिन (`security:manage`) | कॉन्फ़िगर किया गया CIDR अनुमति-सूची पढ़ें |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | एडमिन (`security:manage`) | सेल्फ़-लॉकआउट रोकथाम के साथ CIDR अनुमति-सूची अपडेट करें |
| `GET` | `/api/v1/enterprise/legal-hold` | एडमिन (`compliance:manage`) | उपयोगकर्ता और टीम लीगल होल्ड की सूची बनाएँ |
| `PUT` | `/api/v1/enterprise/legal-hold` | एडमिन (`compliance:manage`) | किसी उपयोगकर्ता या टीम पर एक लीगल होल्ड लागू करें या जारी करें |
| `POST` | `/api/v1/enterprise/scim/token` | एडमिन (`users:manage`) | एक SCIM बियरर टोकन जेनरेट करें, एक बार लौटाया जाता है |
| `DELETE` | `/api/v1/enterprise/scim/token` | एडमिन (`users:manage`) | वर्तमान SCIM बियरर टोकन रद्द करें |
| `GET` | `/api/v1/enterprise/siem/config` | एडमिन (`webhooks:manage`) | SIEM फ़ॉरवर्डिंग कॉन्फ़िग पढ़ें |
| `PUT` | `/api/v1/enterprise/siem/config` | एडमिन (`webhooks:manage`) | SIEM फ़ॉरवर्डिंग कॉन्फ़िग अपडेट करें |
| `GET` | `/api/v1/enterprise/webhooks` | एडमिन (`webhooks:manage`) | वेबहुक गंतव्यों की सूची बनाएँ |
| `POST` | `/api/v1/enterprise/webhooks` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य बनाएँ |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य अपडेट करें |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य हटाएँ |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | एडमिन (`webhooks:manage`) | एक परीक्षण वेबहुक पेलोड भेजें |
| `POST` | `/api/v1/enterprise/users/:id/export` | एडमिन (`compliance:manage`) | एक GDPR उपयोगकर्ता निर्यात जॉब शुरू करें |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | एडमिन (`compliance:manage`) | GDPR निर्यात स्थिति और डाउनलोड URL पढ़ें |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | एडमिन (`compliance:manage`) | पुष्टि के बाद किसी उपयोगकर्ता का डेटा स्थायी रूप से हटाएँ |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | एडमिन (`compliance:manage`) | पुष्टि के बाद किसी टीम का डेटा स्थायी रूप से हटाएँ |
| `GET` | `/api/v1/admin/version` | एडमिन (`system:health`) | ऐप, बिल्ड, Node, और स्कीमा संस्करण मेटाडेटा पढ़ें |
| `GET` | `/api/v1/admin/migrations/pending` | एडमिन (`system:health`) | पैकेज किए गए माइग्रेशन की लागू किए गए माइग्रेशन से तुलना करें |
| `GET` | `/api/v1/admin/upgrade-check` | एडमिन (`system:health`) | अपग्रेड रेडीनेस जाँचें चलाएँ |

### SCIM 2.0 {#scim-2-0}

SCIM डिस्कवरी एंडपॉइंट सार्वजनिक हैं। उपयोगकर्ता और समूह एंडपॉइंट के लिए ऊपर जेनरेट किया गया SCIM बियरर टोकन आवश्यक है।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | सार्वजनिक | SCIM सर्वर क्षमताएँ |
| `GET` | `/api/v1/scim/v2/Schemas` | सार्वजनिक | SCIM स्कीमा डिस्कवरी |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | सार्वजनिक | SCIM संसाधन प्रकार डिस्कवरी |
| `GET` | `/api/v1/scim/v2/Users` | SCIM टोकन | उपयोगकर्ताओं की सूची बनाएँ, वैकल्पिक SCIM फ़िल्टर के साथ |
| `POST` | `/api/v1/scim/v2/Users` | SCIM टोकन | एक उपयोगकर्ता बनाएँ |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता प्राप्त करें |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता को बदलें |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता को सॉफ़्ट निष्क्रिय करें |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM टोकन | टीमों को SCIM समूहों के रूप में सूचीबद्ध करें |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM टोकन | एक टीम बनाएँ |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम प्राप्त करें |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम और समूह सदस्यता को बदलें |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम हटाएँ |

## मीम टेम्पलेट {#meme-templates}

मीम जेनरेटर टूल के लिए सहायक API।

| मेथड | पथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | प्रमाणित | टेक्स्ट बॉक्स स्थितियों के साथ सभी उपलब्ध मीम टेम्पलेट की सूची बनाएँ |
| `GET` | `/api/v1/meme-templates/full/:filename` | प्रमाणित | पूर्ण-आकार टेम्पलेट इमेज परोसें |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | प्रमाणित | टेम्पलेट थंबनेल परोसें |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | प्रमाणित | मीम टेक्स्ट रेंडरिंग के लिए उपयोग की जाने वाली फ़ॉन्ट फ़ाइल परोसें |

## त्रुटि प्रतिक्रियाएँ {#error-responses}

सभी त्रुटियाँ JSON लौटाती हैं:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| स्थिति | अर्थ |
|--------|---------|
| 400 | अमान्य अनुरोध / सत्यापन विफल |
| 401 | प्रमाणित नहीं |
| 403 | अपर्याप्त अनुमतियाँ |
| 404 | संसाधन नहीं मिला |
| 413 | फ़ाइल बहुत बड़ी (`MAX_UPLOAD_SIZE_MB` देखें) |
| 422 | सत्यापन के बाद प्रोसेसिंग विफल |
| 429 | रेट लिमिटेड (`RATE_LIMIT_PER_MIN` देखें) |
| 501 | आवश्यक AI फ़ीचर बंडल इंस्टॉल नहीं है (`FEATURE_NOT_INSTALLED`) |
| 500 | आंतरिक सर्वर त्रुटि |
