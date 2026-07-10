---
description: "संपूर्ण REST API संदर्भ। टूल एंडपॉइंट, बैच प्रोसेसिंग, पाइपलाइन, फ़ाइल लाइब्रेरी, प्रमाणीकरण, टीमें, और एडमिन ऑपरेशन।"
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: d81d5c51c05f
---

# REST API संदर्भ {#rest-api-reference}

अनुरोध/प्रतिक्रिया उदाहरणों के साथ इंटरैक्टिव API डॉक्स [http://localhost:1349/api/docs](http://localhost:1349/api/docs) पर उपलब्ध हैं।

मशीन-पठनीय स्पेक्स:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 स्पेक
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

कीज़ का उपसर्ग `si_` होता है और वे scrypt हैश के रूप में संग्रहीत होती हैं - रॉ की एक बार दिखाई जाती है और फिर कभी पुनः प्राप्त नहीं की जा सकती।

### प्रमाणीकरण एंडपॉइंट {#auth-endpoints}

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | सार्वजनिक | लॉगिन, सेशन टोकन प्राप्त करें |
| `POST` | `/api/auth/logout` | प्रमाणित | वर्तमान सेशन नष्ट करें |
| `GET` | `/api/auth/session` | प्रमाणित | वर्तमान सेशन की पुष्टि करें |
| `POST` | `/api/auth/change-password` | प्रमाणित | अपना पासवर्ड बदलें (अन्य सभी सेशन + API कीज़ को अमान्य कर देता है) |
| `GET` | `/api/auth/users` | एडमिन | सभी उपयोगकर्ताओं की सूची बनाएं |
| `POST` | `/api/auth/register` | एडमिन | एक नया उपयोगकर्ता बनाएं |
| `PUT` | `/api/auth/users/:id` | एडमिन | उपयोगकर्ता की भूमिका या टीम अपडेट करें |
| `POST` | `/api/auth/users/:id/reset-password` | एडमिन | उपयोगकर्ता का पासवर्ड रीसेट करें |
| `DELETE` | `/api/auth/users/:id` | एडमिन | एक उपयोगकर्ता हटाएं |
| `GET` | `/api/v1/config/auth` | सार्वजनिक | जांचें कि प्रमाणीकरण सक्षम है या नहीं (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | प्रमाणित | TOTP MFA नामांकन शुरू करें। एंटरप्राइज़ `mfa` फ़ीचर आवश्यक है |
| `POST` | `/api/auth/mfa/verify` | प्रमाणित | TOTP कोड के साथ MFA नामांकन की पुष्टि करें |
| `POST` | `/api/auth/mfa/complete` | सार्वजनिक | एक लंबित MFA लॉगिन चुनौती पूरी करें |
| `POST` | `/api/auth/mfa/disable` | प्रमाणित | वर्तमान उपयोगकर्ता के लिए MFA अक्षम करें |
| `POST` | `/api/auth/users/:id/mfa/reset` | एडमिन (`users:manage`) | किसी उपयोगकर्ता के लिए MFA रीसेट करें |
| `GET` | `/api/auth/oidc/login` | सार्वजनिक | OIDC सक्षम होने पर OIDC लॉगिन शुरू करें |
| `GET` | `/api/auth/oidc/callback` | सार्वजनिक | OIDC प्राधिकरण कॉलबैक |
| `GET` | `/api/auth/saml/metadata` | सार्वजनिक | SAML सक्षम होने पर SAML SP मेटाडेटा XML |
| `GET` | `/api/auth/saml/login` | सार्वजनिक | SAML लॉगिन शुरू करें |
| `POST` | `/api/auth/saml/callback` | सार्वजनिक | SAML असर्शन कंज्यूमर सर्विस |

जब किसी उपयोगकर्ता के लिए MFA सक्षम होता है, तो `POST /api/auth/login` सेशन टोकन के बजाय `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` लौटाता है। उस `mfaToken` के साथ एक TOTP या रिकवरी कोड को `/api/auth/mfa/complete` पर भेजें।

### अनुमतियाँ {#permissions}

| अनुमति | एडमिन | उपयोगकर्ता |
|-----------|:-----:|:----:|
| टूल्स का उपयोग करें | ✓ | ✓ |
| अपनी फ़ाइलें/पाइपलाइन/API कीज़ | ✓ | ✓ |
| सभी उपयोगकर्ताओं की फ़ाइलें/पाइपलाइन/कीज़ देखें | ✓ | - |
| सेटिंग्स लिखें | ✓ | - |
| उपयोगकर्ताओं और टीमों को प्रबंधित करें | ✓ | - |
| ब्रांडिंग प्रबंधित करें | ✓ | - |

## हेल्थ चेक {#health-check}

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | सार्वजनिक | बुनियादी हेल्थ चेक। 200 के साथ `{"status":"healthy","version":"..."}` लौटाता है, या डेटाबेस पहुँच से बाहर होने पर 503 के साथ `{"status":"unhealthy"}`। |
| `GET` | `/api/v1/readyz` | सार्वजनिक | रेडीनेस प्रोब। PostgreSQL, Redis, डिस्क स्पेस, और कॉन्फ़िगर होने पर S3 की जांच करता है। जब इंस्टेंस को ट्रैफ़िक नहीं मिलना चाहिए तो 503 लौटाता है। |
| `GET` | `/api/v1/admin/health` | एडमिन (`system:health`) | अपटाइम, स्टोरेज मोड, डेटाबेस स्थिति, कतार स्थिति, और GPU उपलब्धता सहित विस्तृत डायग्नोस्टिक्स। |

## टूल्स का उपयोग {#using-tools}

प्रत्येक टूल एक ही पैटर्न का पालन करता है:

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
- `settings` टूल-विशिष्ट विकल्पों वाली एक JSON स्ट्रिंग है।
- `clientJobId` कॉलर-आपूर्ति प्रगति सहसंबंध के लिए एक वैकल्पिक फ़ॉर्म फ़ील्ड है।
- `fileId` एक मौजूदा फ़ाइल लाइब्रेरी आइटम को संदर्भित करने वाला एक वैकल्पिक फ़ॉर्म फ़ील्ड है। मौजूद होने पर, प्रोसेस किया गया आउटपुट एक नए संस्करण के रूप में सहेजा जाता है और प्रतिक्रिया में `savedFileId` शामिल होता है।
- **फ़ास्ट टूल्स** आमतौर पर 200 JSON लौटाते हैं: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`। प्रोसेस की गई फ़ाइल `downloadUrl` से प्राप्त करें।
- **कोई भी कतारबद्ध टूल** 202 JSON लौटा सकता है यदि वह लंबे समय तक चलने वाला हो या सिंक्रोनस प्रतीक्षा विंडो से अधिक हो: `{"jobId":"...","async":true}`। प्रगति के लिए SSE से कनेक्ट करें, फिर पूरा होने पर डाउनलोड करें ([प्रगति ट्रैकिंग](#progress-tracking) देखें)।
- **बैच** रूट सामान्य बैच रजिस्ट्री में पंजीकृत टूल्स के लिए सीधे स्ट्रीम किया गया एक ZIP संग्रह लौटाते हैं (`X-Job-Id` हेडर के साथ)।

## टूल्स संदर्भ {#tools-reference}

### कन्वर्ज़न प्रीसेट {#conversion-presets}

साझा कैटलॉग में 83 समर्पित कन्वर्ज़न प्रीसेट एंडपॉइंट शामिल हैं जैसे `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, और `excel-to-csv`। प्रीसेट फर्स्ट-क्लास टूल रूट हैं:

`POST /api/v1/tools/<section>/<presetId>`

प्रत्येक प्रीसेट आउटपुट फ़ॉर्मेट को लॉक करता है और एक बेस टूल को सौंपता है जैसे `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, या `convert-spreadsheet`। संपूर्ण रूट तालिका और वैकल्पिक सेटिंग्स के लिए [कन्वर्ज़न प्रीसेट](/hi/tools/conversion-presets) देखें।

### आवश्यक टूल्स {#essentials}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `resize` | Resize | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, साथ ही 23 सोशल मीडिया प्रीसेट |
| `crop` | Crop | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Rotate & Flip | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Convert | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Compress | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### ऑप्टिमाइज़ेशन {#optimization}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `optimize-for-web` | Optimize for Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Strip Metadata | - |
| `edit-metadata` | Edit Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Bulk Rename | `pattern` (`{n}`, `{date}`, `{original}` का समर्थन करता है), `startIndex`, `padding` |
| `image-to-pdf` | Image to PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon Generator | `padding`, `backgroundColor`, `borderRadius` - सभी मानक आकार उत्पन्न करता है |

### समायोजन {#adjustments}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `adjust-colors` | Adjust Colors | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Sharpening | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Replace Color | `sourceColor`, `targetColor` (replacement), `makeTransparent`, `tolerance` |
| `color-blindness` | Color Blindness Simulation | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, डिफ़ॉल्ट "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelate | `blockSize` (2-128), `region` (आंशिक पिक्सेलेशन के लिए {left, top, width, height}) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI टूल्स {#ai-tools}

सभी AI टूल्स आपके हार्डवेयर पर चलते हैं: डिफ़ॉल्ट रूप से CPU, या समर्थित NVIDIA GPU उपलब्ध होने पर NVIDIA CUDA। VA-API, Quick Sync, या OpenCL के माध्यम से Intel/AMD iGPU एक्सेलरेशन आज AI इन्फरेंस के लिए समर्थित नहीं है। किसी इंटरनेट की आवश्यकता नहीं।

| टूल ID | नाम | AI मॉडल | प्रमुख सेटिंग्स |
|---------|------|---------|-------------|
| `remove-background` | Remove Background | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Image Upscaling | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Object Eraser | LaMa (ONNX) | मास्क दूसरे फ़ाइल भाग के रूप में भेजा जाता है (फ़ील्डनेम `mask`), `format`, `quality` |
| `ocr` | OCR / Text Extraction | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Face / PII Blur | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart Crop | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Image Enhancement | Analysis-based | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Face Enhancement | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI Colorization | DDColor | `intensity`, `model` |
| `noise-removal` | Noise Removal | Tiered denoising | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Red Eye Removal | Face landmark + color analysis | `sensitivity`, `strength` |
| `restore-photo` | Photo Restoration | Multi-step pipeline | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passport Photo | MediaPipe landmarks | दो-चरण प्रवाह। Analyze मल्टीपार्ट `file` का उपयोग करता है; generate `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), लैंडमार्क, इमेज आयामों के साथ JSON का उपयोग करता है |
| `content-aware-resize` | Content-Aware Resize | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG Transparency Fixer | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Background Replace | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Blur Background | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI Canvas Expand | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### वॉटरमार्क और ओवरले {#watermark-overlay}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `watermark-text` | Text Watermark | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Image Watermark | `opacity`, `position`, `scale` - दूसरी फ़ाइल वॉटरमार्क है |
| `text-overlay` | Text Overlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Image Composition | `x`, `y`, `opacity`, `blend` - दूसरी फ़ाइल शीर्ष पर परत की जाती है |
| `meme-generator` | Meme Generator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`। टेम्पलेट मोड (`templateId` के साथ JSON बॉडी) या कस्टम इमेज मोड (फ़ाइल के साथ मल्टीपार्ट) का समर्थन करता है। |

### उपयोगिताएँ {#utilities}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `info` | Image Info | - (width, height, format, size, channels, hasAlpha, DPI, EXIF लौटाता है) |
| `compare` | Image Compare | `mode` (side-by-side/overlay/diff), `diffThreshold` - दूसरी फ़ाइल तुलना लक्ष्य है |
| `find-duplicates` | Find Duplicates | `threshold` (परसेप्चुअल हैश दूरी, डिफ़ॉल्ट 8) - मल्टी-फ़ाइल |
| `color-palette` | Color Palette | `count` (प्रमुख रंग गणना), `format` (hex/rgb) |
| `qr-generate` | QR Code Generator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (वैकल्पिक फ़ाइल) |
| `barcode-read` | Barcode Reader | - (QR, EAN, Code128, DataMatrix, आदि का स्वतः पता लगाता है) |
| `image-to-base64` | Image to Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML to Image | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - RGB हिस्टोग्राम चार्ट + प्रति-चैनल आँकड़े लौटाता है |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barcode Generator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool)। JSON बॉडी, कोई फ़ाइल अपलोड नहीं। |

### लेआउट और कंपोज़िशन {#layout-composition}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `collage` | Collage / Grid | `template` (25+ लेआउट), `gap`, `backgroundColor`, `borderRadius` - मल्टी-फ़ाइल |
| `stitch` | Stitch / Combine | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - मल्टी-फ़ाइल |
| `split` | Image Splitting | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Border & Frame | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Beautify Screenshot | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Circle Crop | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Image Pad | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - मल्टी-फ़ाइल (2-64 इमेज) |

### फ़ॉर्मेट और कन्वर्ज़न {#format-conversion}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `svg-to-raster` | SVG to Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image to SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF Tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), एक्शन-विशिष्ट पैरामीटर |
| `gif-webp` | GIF/WebP Converter | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### वीडियो टूल्स {#video-tools}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `convert-video` | Convert Video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Compress Video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Trim Video | `startS`, `endS`, `precise` (bool, फ़्रेम-सटीक कट) |
| `mute-video` | Mute Video | - |
| `video-to-gif` | Video to GIF | `fps` (1-30), `width`, `startS`, `durationS` (अधिकतम 60s) |
| `resize-video` | Resize Video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Crop Video | `width`, `height`, `x`, `y` |
| `rotate-video` | Rotate Video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Change FPS | `fps` (1-120) |
| `video-color` | Video Color | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Video Speed | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Reverse Video | - (अधिकतम 5 मिनट) |
| `video-loudnorm` | Normalize Audio | - (EBU R128) |
| `aspect-pad` | Aspect Pad | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Blur Pad | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Watermark Video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilize Video | `smoothing` (5-60, फ़्रेम में) |
| `gif-to-video` | GIF to Video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video to WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video to Frames | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Merge Videos | - (मल्टी-फ़ाइल, पहले वीडियो के रिज़ॉल्यूशन पर सामान्यीकृत) |
| `replace-audio` | Replace Audio | - (वीडियो + ऑडियो फ़ाइल, दो फ़ाइलें) |
| `burn-subtitles` | Burn Subtitles | `fontSize` (8-72) - वीडियो + सबटाइटल फ़ाइल |
| `embed-subtitles` | Embed Subtitles | `language` (ISO 639-2/B कोड) - वीडियो + सबटाइटल फ़ाइल |
| `extract-subtitles` | Extract Subtitles | - (SRT आउटपुट करता है) |
| `images-to-video` | Images to Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - मल्टी-फ़ाइल |
| `video-metadata` | Clean Video Metadata | - |
| `auto-subtitles` | Auto Subtitles (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extract Audio | `format` (mp3/wav/m4a/ogg) |

### ऑडियो टूल्स {#audio-tools}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `convert-audio` | Convert Audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Trim Audio | `startS`, `endS` |
| `volume-adjust` | Volume Adjust | `gainDb` (-30 से 30) |
| `normalize-audio` | Normalize Audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fade Audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Reverse Audio | - |
| `audio-speed` | Audio Speed | `factor` (0.25-4) |
| `pitch-shift` | Pitch Shift | `semitones` (-12 से 12) |
| `audio-channels` | Audio Channels | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Silence Removal | `thresholdDb` (-80 से -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Noise Reduction | `strength` (light/medium/strong) |
| `merge-audio` | Merge Audio | `format` (mp3/wav/flac/m4a) - मल्टी-फ़ाइल |
| `split-audio` | Split Audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Ringtone Maker | `startS`, `durationS` (1-30) |
| `waveform-image` | Waveform Image | `width`, `height`, `color` (hex) |
| `audio-metadata` | Audio Metadata | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcribe Audio (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### डॉक्यूमेंट टूल्स {#document-tools}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `merge-pdf` | Merge PDFs | - (मल्टी-फ़ाइल, 20 PDF तक) |
| `split-pdf` | Split PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Compress PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Rotate PDF | `angle` (90/180/270), `range` (पेज रेंज) |
| `extract-pages` | Extract Pages | `range` (qpdf सिंटैक्स, जैसे "1-5,8,10-z") |
| `remove-pages` | Remove Pages | `pages` (हटाने के लिए qpdf रेंज) |
| `organize-pdf` | Organize PDF | `order` (qpdf पेज क्रम, जैसे "3,1,2,5-z") |
| `protect-pdf` | Protect PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Unlock PDF | `password` |
| `repair-pdf` | Repair PDF | - |
| `linearize-pdf` | Web-Optimize PDF | - (तेज़ वेब व्यूइंग के लिए लीनियराइज़) |
| `grayscale-pdf` | Grayscale PDF | - |
| `pdfa-convert` | PDF/A Convert | - (आर्काइवल PDF/A-2) |
| `crop-pdf` | Crop PDF | `margin` (0-2000 पॉइंट) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Booklet PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Watermark PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF Page Numbers | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Flatten PDF | - (फ़ॉर्म और एनोटेशन को बेक करता है) |
| `redact-pdf` | Redact PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Sign PDF | PDF `file`, सिग्नेचर फ़ाइलों `sig0`, `sig1`, और `placements` JSON ऐरे के साथ कस्टम मल्टीपार्ट रूट |
| `pdf-to-text` | PDF to Text | - |
| `pdf-to-word` | PDF to Word | - |
| `pdf-metadata` | PDF Metadata | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Convert Document | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Convert Presentation | `format` (pptx/odp) |
| `convert-spreadsheet` | Convert Spreadsheet | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel to PDF | - |
| `word-to-pdf` | Word to PDF | - |
| `powerpoint-to-pdf` | PowerPoint to PDF | - |
| `html-to-pdf` | HTML to PDF | - (रिमोट संसाधन अक्षम) |
| `markdown-to-docx` | Markdown to Word | - |
| `markdown-to-html` | Markdown to HTML | - |
| `markdown-to-pdf` | Markdown to PDF | - (रिमोट संसाधन अक्षम) |
| `epub-convert` | Convert EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Convert to EPUB | - (.docx, .md, .html, .txt स्वीकार करता है) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF to Image | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF to JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF to PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF to TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### फ़ाइल टूल्स {#file-tools}

| टूल ID | नाम | प्रमुख सेटिंग्स |
|---------|------|-------------|
| `chart-maker` | Chart Maker | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV to Excel | `sheet` (XLSX इनपुट के लिए वर्कशीट संख्या) - द्विदिशात्मक |
| `csv-json` | CSV to JSON | `pretty` (bool) - द्विदिशात्मक |
| `json-xml` | JSON to XML | `pretty` (bool) - द्विदिशात्मक |
| `split-csv` | Split CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Merge CSVs | - (मल्टी-फ़ाइल, मेल खाते कॉलम) |
| `yaml-json` | YAML / JSON | - (द्विदिशात्मक) |
| `xml-to-csv` | XML to CSV | - (दोहराए जाने वाले तत्वों को स्वतः ढूँढता है) |
| `excel-to-csv` | Excel to CSV | `convert-spreadsheet` द्वारा समर्थित समर्पित कन्वर्ज़न प्रीसेट |
| `create-zip` | Create ZIP | - (मल्टी-फ़ाइल, 2-50 फ़ाइलें) |
| `extract-zip` | Extract ZIP | - (बम-सुरक्षित) |

### HTML to Image {#html-to-image}

एक वेबपेज को इमेज के रूप में कैप्चर करें। अन्य टूल्स के विपरीत, यह एंडपॉइंट मल्टीपार्ट फ़ॉर्म डेटा के बजाय `application/json` स्वीकार करता है (किसी फ़ाइल अपलोड की आवश्यकता नहीं)।

**एंडपॉइंट:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| पैरामीटर | प्रकार | डिफ़ॉल्ट | विवरण |
|-----------|------|---------|-------------|
| `url` | string | (आवश्यक) | कैप्चर करने के लिए URL (केवल http/https) |
| `format` | string | `"png"` | आउटपुट फ़ॉर्मेट: `jpg`, `png`, `webp` |
| `quality` | number | `90` | गुणवत्ता 1-100 (केवल JPG/WebP) |
| `fullPage` | boolean | `false` | पूर्ण स्क्रॉल करने योग्य पेज कैप्चर करें |
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

कुछ टूल्स मानक `POST /api/v1/tools/<section>/<toolId>` से परे अतिरिक्त एंडपॉइंट प्रदर्शित करते हैं:

| मेथड | पाथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | लोकप्रिय टूल ID लौटाएं, उपयोग डेटा विरल होने पर एक क्यूरेट की गई डिफ़ॉल्ट सूची पर वापस लौटते हुए |
| `POST` | `/api/v1/tools/image/remove-background/effects` | AI को फिर से चलाए बिना बैकग्राउंड प्रभाव (color/gradient/blur/shadow) लागू करें। प्रारंभिक हटाने से कैश्ड मास्क का उपयोग करता है। |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | किसी इमेज से मौजूदा EXIF/IPTC/XMP मेटाडेटा पढ़ें |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | स्ट्रिपिंग से पहले मेटाडेटा फ़ील्ड का निरीक्षण करें |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | चरण 1: AI फ़ेस डिटेक्शन + बैकग्राउंड हटाना। फ़ेस लैंडमार्क और कैश्ड डेटा लौटाता है। |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | चरण 2: कैश्ड विश्लेषण का उपयोग करके क्रॉप, रीसाइज़, और टाइल करें। कोई AI री-रन नहीं। |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF मेटाडेटा प्राप्त करें (फ़्रेम गणना, आयाम, अवधि) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF मेटाडेटा प्राप्त करें (पेज गणना, आयाम) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | किसी विशिष्ट PDF पेज का पूर्वावलोकन उत्पन्न करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | समर्पित JPG प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | एक JPG प्रीसेट PDF पेज पूर्वावलोकन उत्पन्न करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | समर्पित PNG प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | एक PNG प्रीसेट PDF पेज पूर्वावलोकन उत्पन्न करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | समर्पित TIFF प्रीसेट के लिए PDF मेटाडेटा प्राप्त करें |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | एक TIFF प्रीसेट PDF पेज पूर्वावलोकन उत्पन्न करें |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | कई SVG को बैच में रास्टर में कन्वर्ट करें |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | इमेज गुणवत्ता का विश्लेषण करें और एन्हांसमेंट अनुशंसाएँ लौटाएं |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | लाइव पैरामीटर ट्यूनिंग के लिए हल्का पूर्वावलोकन। साइज़ हेडर के साथ ऑप्टिमाइज़ की गई इमेज लौटाता है। |

## बैच प्रोसेसिंग {#batch-processing}

एक सामान्य बैच-सक्षम टूल को एक साथ कई फ़ाइलों पर लागू करें। एक ZIP संग्रह लौटाता है। कस्टम मल्टी-फ़ाइल या मल्टी-स्टेप रूट, जैसे PDF साइनिंग, PDF OCR, और PDF-to-image प्रीसेट रूट, सामान्य `/batch` रूट के बजाय अपने स्वयं के एंडपॉइंट अनुबंध का उपयोग करते हैं।

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

समवर्तीता `CONCURRENT_JOBS` द्वारा नियंत्रित होती है (डिफ़ॉल्ट: CPU कोर से स्वतः पता लगाया जाता है)। `MAX_BATCH_SIZE` प्रति बैच फ़ाइलों की संख्या सीमित करता है (डिफ़ॉल्ट: 100; असीमित के लिए 0 सेट करें)।

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

प्रत्येक चरण का आउटपुट अगले चरण का इनपुट होता है। पाइपलाइन डिफ़ॉल्ट रूप से 20 चरणों की अनुमति देती हैं, जो `MAX_PIPELINE_STEPS` के माध्यम से कॉन्फ़िगर करने योग्य है। सीमा हटाने के लिए `MAX_PIPELINE_STEPS=0` सेट करें।

### पाइपलाइन सहेजें और प्रबंधित करें {#save-and-manage-pipelines}

| मेथड | पाथ | विवरण |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | एक नामित पाइपलाइन सहेजें (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | सहेजी गई पाइपलाइनों की सूची बनाएं (एडमिन सभी देखते हैं; उपयोगकर्ता अपनी देखते हैं) |
| `DELETE` | `/api/v1/pipeline/:id` | हटाएं (मालिक या एडमिन) |
| `GET` | `/api/v1/pipeline/tools` | पाइपलाइन चरणों के लिए मान्य टूल ID की सूची बनाएं |

## प्रगति ट्रैकिंग {#progress-tracking}

लंबे समय तक चलने वाले जॉब, कतारबद्ध टूल, बैच जॉब, और पाइपलाइन Server-Sent Events के माध्यम से रीयल-टाइम प्रगति उत्सर्जित करते हैं। प्रगति स्ट्रीम सार्वजनिक है और जॉब ID द्वारा कीड की जाती है, इसलिए क्लाइंट को इसे पढ़ने के लिए Authorization हेडर भेजने की आवश्यकता नहीं है।

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

आप `POST /api/v1/jobs/:jobId/cancel` के साथ किसी कतारबद्ध या चल रहे जॉब के लिए रद्दीकरण का अनुरोध कर सकते हैं। प्रतिक्रिया `{"canceled":true|false}` है।

## फ़ाइल लाइब्रेरी {#file-library}

संस्करण इतिहास के साथ स्थायी फ़ाइल स्टोरेज।

| मेथड | पाथ | विवरण |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | वर्कस्पेस में फ़ाइलें अपलोड करें (अस्थायी प्रोसेसिंग) |
| `POST` | `/api/v1/files/upload` | स्थायी फ़ाइल लाइब्रेरी में फ़ाइलें अपलोड करें |
| `POST` | `/api/v1/files/save-result` | किसी टूल प्रोसेसिंग परिणाम को एक नए फ़ाइल संस्करण के रूप में सहेजें |
| `GET` | `/api/v1/files` | सहेजी गई फ़ाइलों की सूची बनाएं (पृष्ठांकित, खोज के साथ) |
| `GET` | `/api/v1/files/:id` | फ़ाइल मेटाडेटा + संस्करण श्रृंखला प्राप्त करें |
| `GET` | `/api/v1/files/:id/download` | फ़ाइल डाउनलोड करें |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px JPEG थंबनेल प्राप्त करें |
| `DELETE` | `/api/v1/files` | फ़ाइलें और उनकी संस्करण श्रृंखलाओं को बल्क में हटाएं (बॉडी: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | URL-आधारित आयात के लिए रिमोट URL को वर्कस्पेस में फ़ेच करें |
| `POST` | `/api/v1/preview` | एक ब्राउज़र-संगत WebP पूर्वावलोकन उत्पन्न करें (HEIC/HEIF/RAW फ़ॉर्मेट के लिए) |
| `GET` | `/api/v1/files/:id/preview` | किसी सहेजी गई PDF, ऑफ़िस डॉक्यूमेंट, वीडियो, या ऑडियो फ़ाइल के लिए कैश्ड या जनरेट किया गया ब्राउज़र-संगत पूर्वावलोकन स्ट्रीम करें |
| `POST` | `/api/v1/preview/generate` | किसी अपलोड की गई मीडिया फ़ाइल के लिए उसे पहले सहेजे बिना ऑन-डिमांड MP4 या MP3 पूर्वावलोकन उत्पन्न करें |
| `GET` | `/api/v1/download/:jobId/:filename` | किसी वर्कस्पेस से प्रोसेस की गई फ़ाइल डाउनलोड करें |

किसी टूल परिणाम को लाइब्रेरी में स्वतः सहेजने के लिए, किसी मौजूदा लाइब्रेरी फ़ाइल को संदर्भित करते हुए `fileId` को एक मल्टीपार्ट फ़ॉर्म फ़ील्ड के रूप में शामिल करें। प्रोसेस किया गया परिणाम एक नए संस्करण के रूप में सहेजा जाएगा।

## API की प्रबंधन {#api-key-management}

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | प्रमाणित | नई की जनरेट करें - एक बार दिखाई जाती है |
| `GET` | `/api/v1/api-keys` | प्रमाणित | कीज़ की सूची बनाएं (name, id, lastUsedAt - रॉ की नहीं) |
| `DELETE` | `/api/v1/api-keys/:id` | प्रमाणित | की हटाएं |

## टीमें {#teams}

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | एडमिन (`teams:manage`) | टीमों की सूची बनाएं |
| `POST` | `/api/v1/teams` | एडमिन (`teams:manage`) | टीम बनाएं |
| `PUT` | `/api/v1/teams/:id` | एडमिन (`teams:manage`) | टीम का नाम बदलें |
| `DELETE` | `/api/v1/teams/:id` | एडमिन (`teams:manage`) | टीम हटाएं (डिफ़ॉल्ट टीम या सदस्यों वाली टीमों को नहीं हटा सकते) |

## सेटिंग्स {#settings}

रनटाइम की-वैल्यू कॉन्फ़िगरेशन (किसी भी प्रमाणित उपयोगकर्ता द्वारा पढ़ा जाता है, केवल एडमिन द्वारा लिखा जाता है)।

| मेथड | पाथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | सभी सेटिंग्स प्राप्त करें |
| `PUT` | `/api/v1/settings` | सेटिंग्स को बल्क में अपडेट करें (की-वैल्यू युग्मों वाली JSON बॉडी) |
| `GET` | `/api/v1/settings/:key` | की के आधार पर एक विशिष्ट सेटिंग प्राप्त करें |

ज्ञात कीज़: `disabledTools` (टूल ID की JSON ऐरे), `enableExperimentalTools` (bool स्ट्रिंग), `loginAttemptLimit` (संख्या)।

## प्राथमिकताएँ {#preferences}

प्रति-उपयोगकर्ता प्राथमिकताएँ इंस्टेंस सेटिंग्स से अलग होती हैं। कोई भी प्रमाणित उपयोगकर्ता अपने स्वयं के प्राथमिकता मानचित्र को पढ़ और अपडेट कर सकता है।

| मेथड | पाथ | विवरण |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | वर्तमान उपयोगकर्ता की प्राथमिकताएँ `{ "preferences": { ... } }` के रूप में प्राप्त करें |
| `PUT` | `/api/v1/preferences` | वर्तमान उपयोगकर्ता के लिए एक या अधिक प्राथमिकता कीज़ को अपसर्ट करें |

## भूमिकाएँ {#roles}

सूक्ष्म अनुमतियों के साथ कस्टम भूमिका प्रबंधन।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | एडमिन (`audit:read`) | उपयोगकर्ता गणना के साथ सभी भूमिकाओं की सूची बनाएं |
| `POST` | `/api/v1/roles` | एडमिन (`security:manage`) | एक कस्टम भूमिका बनाएं (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | एडमिन (`security:manage`) | एक कस्टम भूमिका अपडेट करें (बिल्ट-इन भूमिकाओं को संशोधित नहीं कर सकते) |
| `DELETE` | `/api/v1/roles/:id` | एडमिन (`security:manage`) | एक कस्टम भूमिका हटाएं (बिल्ट-इन भूमिकाओं को नहीं हटा सकते; प्रभावित उपयोगकर्ता `user` भूमिका पर वापस लौट जाते हैं) |

उपलब्ध अनुमतियाँ (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`।

## ऑडिट लॉग {#audit-log}

सुरक्षा-संबंधी क्रियाओं की समीक्षा के लिए केवल-एडमिन एंडपॉइंट।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | एडमिन (`audit:read`) | वैकल्पिक फ़िल्टर के साथ पृष्ठांकित ऑडिट लॉग |

क्वेरी पैरामीटर:

| पैरामीटर | विवरण |
|-----------|-------------|
| `page` | पेज संख्या (डिफ़ॉल्ट: 1) |
| `limit` | प्रति पेज प्रविष्टियाँ (डिफ़ॉल्ट: 50, अधिकतम: 100) |
| `action` | क्रिया प्रकार के आधार पर फ़िल्टर करें (जैसे `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | स्रोत IP पते के आधार पर फ़िल्टर करें |
| `from` | इस ISO 8601 तिथि के बाद की प्रविष्टियाँ फ़िल्टर करें |
| `to` | इस ISO 8601 तिथि से पहले की प्रविष्टियाँ फ़िल्टर करें |

## एनालिटिक्स {#analytics}

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | सार्वजनिक | प्रभावी एनालिटिक्स कॉन्फ़िगरेशन प्राप्त करें (PostHog की, Sentry DSN, सैंपल रेट)। जब एनालिटिक्स बंद होता है, चाहे कंपाइल-टाइम बेक से या इंस्टेंस `analyticsEnabled` सेटिंग से, तो कीज़, DSN, और इंस्टेंस ID खाली होते हैं। |
| `POST` | `/api/v1/feedback` | प्रमाणित | कॉन्फ़िगर किए गए PostHog प्रोजेक्ट को `feedback_submitted` के रूप में स्पष्ट उपयोगकर्ता फ़ीडबैक सबमिट करें। यह रूट एनालिटिक्स गेट का सम्मान करता है, सबमिशन को रेट-लिमिट करता है, जब तक `contactOk` सत्य न हो, संपर्क फ़ील्ड को स्ट्रिप करता है, और फ़ाइल सामग्री, फ़ाइल नाम, अपलोड पाथ, या रॉ निजी त्रुटि टेक्स्ट को कभी स्वीकार नहीं करता। जब एनालिटिक्स अक्षम होता है, तो यह `{ "ok": true, "accepted": false }` लौटाता है। |
| `PUT` | `/api/v1/settings` | एडमिन (`settings:write`) | इंस्टेंस-व्यापी ऑप्ट-आउट सेट करें। सभी के लिए एनालिटिक्स बंद करने हेतु एक JSON बॉडी `{ "analyticsEnabled": "false" }` भेजें, या इसे फिर से चालू करने हेतु `"true"`। |

## फ़ीचर / AI बंडल {#features-ai-bundles}

AI फ़ीचर बंडल प्रबंधित करें (Docker वातावरण में AI मॉडल पैकेज इंस्टॉल/अनइंस्टॉल करें)।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | प्रमाणित | सभी फ़ीचर बंडल और उनकी इंस्टॉल स्थिति की सूची बनाएं |
| `POST` | `/api/v1/admin/features/:bundleId/install` | एडमिन (`features:manage`) | एक फ़ीचर बंडल इंस्टॉल करें (एसिंक, प्रगति ट्रैकिंग के लिए `jobId` लौटाता है) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | एडमिन (`features:manage`) | एक फ़ीचर बंडल अनइंस्टॉल करें और मॉडल फ़ाइलें साफ़ करें |
| `GET` | `/api/v1/admin/features/disk-usage` | एडमिन (`features:manage`) | AI मॉडल का कुल डिस्क उपयोग प्राप्त करें |
| `POST` | `/api/v1/admin/features/import` | एडमिन (`features:manage`) | एक ऑफ़लाइन AI बंडल संग्रह आयात करें |

## एडमिन ऑपरेशन {#admin-operations}

अवलोकनीयता, समर्थन, उपयोग रिपोर्टिंग, और बैकअप स्थिति के लिए ऑपरेशनल एंडपॉइंट।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | एडमिन (`settings:write`) | वर्तमान रनटाइम लॉग स्तर पढ़ें |
| `POST` | `/api/v1/admin/log-level` | एडमिन (`settings:write`) | रनटाइम लॉग स्तर बदलें (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, या `silent`) |
| `GET` | `/api/v1/metrics` | एडमिन (`system:health`) | टेक्स्ट फ़ॉर्मेट में Prometheus मेट्रिक्स |
| `GET` | `/api/v1/admin/support-bundle` | एडमिन (`system:health`) | एक रिडैक्ट किया गया डायग्नोस्टिक सपोर्ट बंडल ZIP डाउनलोड करें |
| `GET` | `/api/v1/admin/usage` | एडमिन (`audit:read`) | उपयोग डैशबोर्ड डेटा, वैकल्पिक `days` क्वेरी पैरामीटर के साथ |
| `GET` | `/api/v1/admin/backup-status` | एडमिन (`system:health`) | अंतिम बैकअप मेटाडेटा और ताज़गी स्थिति पढ़ें |
| `POST` | `/api/v1/admin/backup-status` | एडमिन (`system:health`) | एक पूर्ण किया गया बैकअप रिकॉर्ड करें (`type`, वैकल्पिक `sizeBytes`, वैकल्पिक `notes`) |

## एंटरप्राइज़ API {#enterprise-apis}

ये रूट अपने संबंधित एंटरप्राइज़ फ़ीचर द्वारा लाइसेंस-गेटेड हैं। इनके लिए अभी भी सूचीबद्ध SnapOtter अनुमति आवश्यक है।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | एडमिन (`audit:read`) | फ़िल्टर के साथ ऑडिट प्रविष्टियों को JSON या CSV के रूप में निर्यात करें |
| `GET` | `/api/v1/enterprise/config/export` | एडमिन (`system:health`) | रिडैक्ट किया गया इंस्टेंस कॉन्फ़िग, कस्टम भूमिकाएँ, और टीमें निर्यात करें |
| `POST` | `/api/v1/enterprise/config/import` | एडमिन (`system:health`) | कॉन्फ़िग आयात करें, वैकल्पिक ड्राई रन के साथ |
| `GET` | `/api/v1/enterprise/ip-allowlist` | एडमिन (`security:manage`) | कॉन्फ़िगर की गई CIDR अनुमति सूची पढ़ें |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | एडमिन (`security:manage`) | सेल्फ-लॉकआउट रोकथाम के साथ CIDR अनुमति सूची अपडेट करें |
| `GET` | `/api/v1/enterprise/legal-hold` | एडमिन (`compliance:manage`) | उपयोगकर्ता और टीम लीगल होल्ड की सूची बनाएं |
| `PUT` | `/api/v1/enterprise/legal-hold` | एडमिन (`compliance:manage`) | किसी उपयोगकर्ता या टीम पर एक लीगल होल्ड लागू करें या जारी करें |
| `POST` | `/api/v1/enterprise/scim/token` | एडमिन (`users:manage`) | एक SCIM बियरर टोकन जनरेट करें, एक बार लौटाया जाता है |
| `DELETE` | `/api/v1/enterprise/scim/token` | एडमिन (`users:manage`) | वर्तमान SCIM बियरर टोकन को रद्द करें |
| `GET` | `/api/v1/enterprise/siem/config` | एडमिन (`webhooks:manage`) | SIEM फ़ॉरवर्डिंग कॉन्फ़िग पढ़ें |
| `PUT` | `/api/v1/enterprise/siem/config` | एडमिन (`webhooks:manage`) | SIEM फ़ॉरवर्डिंग कॉन्फ़िग अपडेट करें |
| `GET` | `/api/v1/enterprise/webhooks` | एडमिन (`webhooks:manage`) | वेबहुक गंतव्यों की सूची बनाएं |
| `POST` | `/api/v1/enterprise/webhooks` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य बनाएं |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य अपडेट करें |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | एडमिन (`webhooks:manage`) | एक वेबहुक गंतव्य हटाएं |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | एडमिन (`webhooks:manage`) | एक टेस्ट वेबहुक पेलोड भेजें |
| `POST` | `/api/v1/enterprise/users/:id/export` | एडमिन (`compliance:manage`) | एक GDPR उपयोगकर्ता निर्यात जॉब शुरू करें |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | एडमिन (`compliance:manage`) | GDPR निर्यात स्थिति और डाउनलोड URL पढ़ें |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | एडमिन (`compliance:manage`) | पुष्टि के बाद किसी उपयोगकर्ता का डेटा स्थायी रूप से पर्ज करें |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | एडमिन (`compliance:manage`) | पुष्टि के बाद किसी टीम का डेटा स्थायी रूप से पर्ज करें |
| `GET` | `/api/v1/admin/version` | एडमिन (`system:health`) | ऐप, बिल्ड, Node, और स्कीमा संस्करण मेटाडेटा पढ़ें |
| `GET` | `/api/v1/admin/migrations/pending` | एडमिन (`system:health`) | पैकेज किए गए माइग्रेशन की लागू किए गए माइग्रेशन से तुलना करें |
| `GET` | `/api/v1/admin/upgrade-check` | एडमिन (`system:health`) | अपग्रेड रेडीनेस जांच चलाएं |

### SCIM 2.0 {#scim-2-0}

SCIM डिस्कवरी एंडपॉइंट सार्वजनिक हैं। उपयोगकर्ता और समूह एंडपॉइंट के लिए ऊपर जनरेट किए गए SCIM बियरर टोकन की आवश्यकता होती है।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | सार्वजनिक | SCIM सर्वर क्षमताएँ |
| `GET` | `/api/v1/scim/v2/Schemas` | सार्वजनिक | SCIM स्कीमा डिस्कवरी |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | सार्वजनिक | SCIM संसाधन प्रकार डिस्कवरी |
| `GET` | `/api/v1/scim/v2/Users` | SCIM टोकन | उपयोगकर्ताओं की सूची बनाएं, वैकल्पिक SCIM फ़िल्टर के साथ |
| `POST` | `/api/v1/scim/v2/Users` | SCIM टोकन | एक उपयोगकर्ता बनाएं |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता प्राप्त करें |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता को प्रतिस्थापित करें |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM टोकन | एक उपयोगकर्ता को सॉफ़्ट निष्क्रिय करें |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM टोकन | टीमों को SCIM समूहों के रूप में सूचीबद्ध करें |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM टोकन | एक टीम बनाएं |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम प्राप्त करें |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम और समूह सदस्यता को प्रतिस्थापित करें |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM टोकन | एक टीम हटाएं |

## मीम टेम्पलेट {#meme-templates}

मीम जनरेटर टूल के लिए सहायक API।

| मेथड | पाथ | पहुँच | विवरण |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | प्रमाणित | टेक्स्ट बॉक्स स्थितियों के साथ सभी उपलब्ध मीम टेम्पलेट की सूची बनाएं |
| `GET` | `/api/v1/meme-templates/full/:filename` | प्रमाणित | पूर्ण-आकार टेम्पलेट इमेज प्रदान करें |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | प्रमाणित | टेम्पलेट थंबनेल प्रदान करें |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | प्रमाणित | मीम टेक्स्ट रेंडरिंग के लिए उपयोग की जाने वाली फ़ॉन्ट फ़ाइल प्रदान करें |

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
