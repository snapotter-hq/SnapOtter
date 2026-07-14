---
description: "Référence complète de l'API REST. Points de terminaison des outils, traitement par lots, pipelines, bibliothèque de fichiers, authentification, équipes et opérations d'administration."
i18n_output_hash: 450fd529e479
i18n_source_hash: b89b5df16af5
i18n_provenance: human
---

# Référence de l'API REST {#rest-api-reference}

La documentation interactive de l'API, avec des exemples de requête et de réponse, est disponible sur [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Spécifications lisibles par machine :
- `/api/v1/openapi.yaml` - spécification OpenAPI 3.1
- `/llms.txt` - résumé adapté aux LLM
- `/llms-full.txt` - documentation complète adaptée aux LLM

## Authentification {#authentication}

Tous les points de terminaison exigent une authentification, sauf lorsque `AUTH_ENABLED=false`.

### Jeton de session {#session-token}

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

Les sessions expirent au bout de 7 jours (configurable via `SESSION_DURATION_HOURS`).

### Clés d'API {#api-keys}

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

Les clés sont préfixées par `si_` et stockées sous forme de hachages scrypt : la clé brute est affichée une seule fois et ne peut plus jamais être récupérée.

### Points de terminaison d'authentification {#auth-endpoints}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Connexion, obtention d'un jeton de session |
| `POST` | `/api/auth/logout` | Auth | Détruire la session actuelle |
| `GET` | `/api/auth/session` | Auth | Valider la session actuelle |
| `POST` | `/api/auth/change-password` | Auth | Changer son propre mot de passe (invalide toutes les autres sessions et clés d'API) |
| `GET` | `/api/auth/users` | Admin | Lister tous les utilisateurs |
| `POST` | `/api/auth/register` | Admin | Créer un nouvel utilisateur |
| `PUT` | `/api/auth/users/:id` | Admin | Mettre à jour le rôle ou l'équipe d'un utilisateur |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Réinitialiser le mot de passe d'un utilisateur |
| `DELETE` | `/api/auth/users/:id` | Admin | Supprimer un utilisateur |
| `GET` | `/api/v1/config/auth` | Public | Vérifier si l'authentification est activée (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Démarrer l'inscription à l'authentification multifacteur TOTP. Nécessite la fonctionnalité entreprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Confirmer l'inscription à l'authentification multifacteur avec un code TOTP |
| `POST` | `/api/auth/mfa/complete` | Public | Terminer un défi de connexion multifacteur en attente |
| `POST` | `/api/auth/mfa/disable` | Auth | Désactiver l'authentification multifacteur pour l'utilisateur actuel |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Réinitialiser l'authentification multifacteur d'un utilisateur |
| `GET` | `/api/auth/oidc/login` | Public | Démarrer la connexion OIDC lorsque OIDC est activé |
| `GET` | `/api/auth/oidc/callback` | Public | Rappel d'autorisation OIDC |
| `GET` | `/api/auth/saml/metadata` | Public | XML de métadonnées SP SAML lorsque SAML est activé |
| `GET` | `/api/auth/saml/login` | Public | Démarrer la connexion SAML |
| `POST` | `/api/auth/saml/callback` | Public | Service consommateur d'assertions SAML |

Lorsque l'authentification multifacteur est activée pour un utilisateur, `POST /api/auth/login` renvoie `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` au lieu d'un jeton de session. Envoyez ce `mfaToken` accompagné d'un code TOTP ou d'un code de récupération à `/api/auth/mfa/complete`.

### Autorisations {#permissions}

| Autorisation | Admin | Utilisateur |
|-----------|:-----:|:----:|
| Utiliser les outils | ✓ | ✓ |
| Ses propres fichiers/pipelines/clés d'API | ✓ | ✓ |
| Voir les fichiers/pipelines/clés de tous les utilisateurs | ✓ | - |
| Écrire les paramètres | ✓ | - |
| Gérer les utilisateurs et les équipes | ✓ | - |
| Gérer l'image de marque | ✓ | - |

## Vérification de l'état {#health-check}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | Vérification de base de l'état. Renvoie `{"status":"healthy","version":"..."}` avec 200, ou `{"status":"unhealthy"}` avec 503 si la base de données est inaccessible. |
| `GET` | `/api/v1/readyz` | Public | Sonde de disponibilité. Vérifie PostgreSQL, Redis, l'espace disque et S3 lorsqu'il est configuré. Renvoie 503 lorsque l'instance ne doit pas recevoir de trafic. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnostics détaillés incluant la durée de fonctionnement, le mode de stockage, l'état de la base de données, l'état de la file d'attente et la disponibilité du GPU. |

## Utilisation des outils {#using-tools}

Chaque outil suit le même schéma :

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

`<section>` est l'un de `image`, `video`, `audio`, `pdf`, ou `files`.

- Le téléversement est `multipart/form-data`.
- `settings` est une chaîne JSON contenant des options spécifiques à l'outil.
- `clientJobId` est un champ de formulaire optionnel pour la corrélation de progression fournie par l'appelant.
- `fileId` est un champ de formulaire optionnel référençant un élément existant de la bibliothèque de fichiers. Lorsqu'il est présent, la sortie traitée est enregistrée comme nouvelle version et la réponse inclut `savedFileId`.
- **Les outils rapides** renvoient généralement du JSON en 200 : `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Récupérez le fichier traité depuis `downloadUrl`.
- **Tout outil mis en file d'attente** peut renvoyer du JSON en 202 s'il est de longue durée ou dépasse la fenêtre d'attente synchrone : `{"jobId":"...","async":true}`. Connectez-vous au SSE pour suivre la progression, puis téléchargez une fois terminé (voir [Suivi de la progression](#progress-tracking)).
- **Les routes par lots** renvoient une archive ZIP diffusée directement (avec l'en-tête `X-Job-Id`) pour les outils enregistrés dans le registre générique de traitement par lots.

## Référence des outils {#tools-reference}

### Préréglages de conversion {#conversion-presets}

Le catalogue partagé inclut 83 points de terminaison de préréglages de conversion dédiés, tels que `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, et `excel-to-csv`. Les préréglages sont des routes d'outils de première classe :

`POST /api/v1/tools/<section>/<presetId>`

Chaque préréglage verrouille le format de sortie et délègue à un outil de base tel que `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, ou `convert-spreadsheet`. Consultez [Préréglages de conversion](/fr/tools/conversion-presets) pour le tableau complet des routes et les paramètres optionnels.

### Essentiels {#essentials}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `resize` | Redimensionner | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 préréglages pour les réseaux sociaux |
| `crop` | Rogner | `left`, `top`, `width`, `height`, `unit` (px/pourcentage) |
| `rotate` | Pivoter et retourner | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Convertir | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Compresser | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimisation {#optimization}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `optimize-for-web` | Optimiser pour le Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Supprimer les métadonnées | - |
| `edit-metadata` | Modifier les métadonnées | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Renommage en masse | `pattern` (prend en charge `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Image vers PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Générateur de favicon | `padding`, `backgroundColor`, `borderRadius` - génère toutes les tailles standard |

### Réglages {#adjustments}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `adjust-colors` | Ajuster les couleurs | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Accentuation | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Remplacer une couleur | `sourceColor`, `targetColor` (remplacement), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulation de daltonisme | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, par défaut \"deuteranomaly\") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelliser | `blockSize` (2-128), `region` ({left, top, width, height} pour une pixellisation partielle) |
| `vignette` | Vignettage | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Outils d'IA {#ai-tools}

Tous les outils d'IA s'exécutent sur votre matériel : CPU par défaut, ou NVIDIA CUDA lorsqu'un GPU NVIDIA compatible est disponible. L'accélération via iGPU Intel/AMD par VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence d'IA. Aucune connexion Internet requise.

| ID de l'outil | Nom | Modèle d'IA | Paramètres principaux |
|---------|------|---------|-------------|
| `remove-background` | Supprimer l'arrière-plan | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Agrandissement d'image | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Gomme d'objets | LaMa (ONNX) | Le masque est envoyé comme deuxième partie de fichier (nom de champ `mask`), `format`, `quality` |
| `ocr` | OCR / Extraction de texte | Tesseract (rapide) ; RapidOCR + PP-OCR ONNX (équilibré/meilleur) | `quality` (rapide/équilibré/meilleur), `language`, `enhance` |
| `blur-faces` | Floutage des visages / données personnelles | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Rognage intelligent | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Amélioration d'image | Basé sur l'analyse | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Amélioration des visages | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Colorisation par IA | DDColor | `intensity`, `model` |
| `noise-removal` | Suppression du bruit | Débruitage à plusieurs niveaux | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Suppression des yeux rouges | Points de repère du visage + analyse des couleurs | `sensitivity`, `strength` |
| `restore-photo` | Restauration de photos | Pipeline multi-étapes | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Photo d'identité | Points de repère MediaPipe | Flux en deux phases. L'analyse utilise le multipart `file` ; la génération utilise du JSON avec `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), points de repère, dimensions de l'image |
| `content-aware-resize` | Redimensionnement adaptatif au contenu | Découpe par coutures (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Correcteur de transparence PNG | Détourage HR BiRefNet | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Remplacer l'arrière-plan | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Flouter l'arrière-plan | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Extension de canevas par IA | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Filigrane et superposition {#watermark-overlay}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `watermark-text` | Filigrane de texte | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Filigrane d'image | `opacity`, `position`, `scale` - le deuxième fichier est le filigrane |
| `text-overlay` | Superposition de texte | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Composition d'images | `x`, `y`, `opacity`, `blend` - le deuxième fichier est superposé par-dessus |
| `meme-generator` | Générateur de mèmes | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Prend en charge le mode modèle (corps JSON avec `templateId`) ou le mode image personnalisée (multipart avec fichier). |

### Utilitaires {#utilities}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `info` | Infos sur l'image | - (renvoie width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Comparer des images | `mode` (side-by-side/overlay/diff), `diffThreshold` - le deuxième fichier est la cible de comparaison |
| `find-duplicates` | Trouver les doublons | `threshold` (distance de hachage perceptuel, par défaut 8) - multi-fichiers |
| `color-palette` | Palette de couleurs | `count` (nombre de couleurs dominantes), `format` (hex/rgb) |
| `qr-generate` | Générateur de code QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (fichier optionnel) |
| `barcode-read` | Lecteur de code-barres | - (détecte automatiquement QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Image vers Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML vers image | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogramme | `scale` (linear/log) - renvoie un graphique d'histogramme RGB + statistiques par canal |
| `lqip-placeholder` | Espace réservé LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Générateur de code-barres | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Corps JSON, aucun téléversement de fichier. |

### Mise en page et composition {#layout-composition}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `collage` | Collage / Grille | `template` (plus de 25 dispositions), `gap`, `backgroundColor`, `borderRadius` - multi-fichiers |
| `stitch` | Assembler / Combiner | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-fichiers |
| `split` | Découpe d'image | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Bordure et cadre | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Embellir une capture d'écran | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Rognage circulaire | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Marges d'image | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Feuille de sprites | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - multi-fichiers (2-64 images) |

### Format et conversion {#format-conversion}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `svg-to-raster` | SVG vers matriciel | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image vers SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Outils GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), paramètres spécifiques à l'action |
| `gif-webp` | Convertisseur GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Outils vidéo {#video-tools}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `convert-video` | Convertir une vidéo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Compresser une vidéo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Découper une vidéo | `startS`, `endS`, `precise` (bool, coupe précise à l'image près) |
| `mute-video` | Couper le son d'une vidéo | - |
| `video-to-gif` | Vidéo vers GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60 s) |
| `resize-video` | Redimensionner une vidéo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Rogner une vidéo | `width`, `height`, `x`, `y` |
| `rotate-video` | Pivoter une vidéo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Modifier les images par seconde | `fps` (1-120) |
| `video-color` | Couleur de la vidéo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Vitesse de la vidéo | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Inverser une vidéo | - (max 5 minutes) |
| `video-loudnorm` | Normaliser l'audio | - (EBU R128) |
| `aspect-pad` | Marges au format | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Marges floutées | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Filigrane sur vidéo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabiliser une vidéo | `smoothing` (5-60, en images) |
| `gif-to-video` | GIF vers vidéo | `format` (mp4/webm/mov) |
| `video-to-webp` | Vidéo vers WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Vidéo vers images | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Fusionner des vidéos | - (multi-fichiers, normalisées à la résolution de la première vidéo) |
| `replace-audio` | Remplacer l'audio | - (vidéo + fichier audio, deux fichiers) |
| `burn-subtitles` | Incruster des sous-titres | `fontSize` (8-72) - vidéo + fichier de sous-titres |
| `embed-subtitles` | Intégrer des sous-titres | `language` (code ISO 639-2/B) - vidéo + fichier de sous-titres |
| `extract-subtitles` | Extraire des sous-titres | - (produit du SRT) |
| `images-to-video` | Images vers vidéo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - multi-fichiers |
| `video-metadata` | Nettoyer les métadonnées vidéo | - |
| `auto-subtitles` | Sous-titres automatiques (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extraire l'audio | `format` (mp3/wav/m4a/ogg) |

### Outils audio {#audio-tools}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `convert-audio` | Convertir l'audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Découper l'audio | `startS`, `endS` |
| `volume-adjust` | Ajuster le volume | `gainDb` (-30 à 30) |
| `normalize-audio` | Normaliser l'audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fondu audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Inverser l'audio | - |
| `audio-speed` | Vitesse de l'audio | `factor` (0.25-4) |
| `pitch-shift` | Décalage de hauteur | `semitones` (-12 à 12) |
| `audio-channels` | Canaux audio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Suppression des silences | `thresholdDb` (-80 à -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Réduction du bruit | `strength` (light/medium/strong) |
| `merge-audio` | Fusionner l'audio | `format` (mp3/wav/flac/m4a) - multi-fichiers |
| `split-audio` | Diviser l'audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Créateur de sonnerie | `startS`, `durationS` (1-30) |
| `waveform-image` | Image de forme d'onde | `width`, `height`, `color` (hex) |
| `audio-metadata` | Métadonnées audio | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcrire l'audio (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Outils de documents {#document-tools}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `merge-pdf` | Fusionner des PDF | - (multi-fichiers, jusqu'à 20 PDF) |
| `split-pdf` | Diviser un PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Compresser un PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Pivoter un PDF | `angle` (90/180/270), `range` (plage de pages) |
| `extract-pages` | Extraire des pages | `range` (syntaxe qpdf, par exemple \"1-5,8,10-z\") |
| `remove-pages` | Supprimer des pages | `pages` (plage qpdf à supprimer) |
| `organize-pdf` | Organiser un PDF | `order` (ordre des pages qpdf, par exemple \"3,1,2,5-z\") |
| `protect-pdf` | Protéger un PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Déverrouiller un PDF | `password` |
| `repair-pdf` | Réparer un PDF | - |
| `linearize-pdf` | Optimiser un PDF pour le Web | - (linéariser pour un affichage web rapide) |
| `grayscale-pdf` | PDF en niveaux de gris | - |
| `pdfa-convert` | Convertir en PDF/A | - (PDF/A-2 d'archivage) |
| `crop-pdf` | Rogner un PDF | `margin` (0-2000 points) |
| `nup-pdf` | PDF N pages par feuille | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | PDF en livret | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Filigrane sur PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Numéros de page du PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Aplatir un PDF | - (intègre les formulaires et les annotations) |
| `redact-pdf` | Caviarder un PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Signer un PDF | Route multipart personnalisée avec le PDF `file`, les fichiers de signature `sig0`, `sig1`, et le tableau JSON `placements` |
| `pdf-to-text` | PDF vers texte | - |
| `pdf-to-word` | PDF vers Word | - |
| `pdf-metadata` | Métadonnées du PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Convertir un document | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Convertir une présentation | `format` (pptx/odp) |
| `convert-spreadsheet` | Convertir une feuille de calcul | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel vers PDF | - |
| `word-to-pdf` | Word vers PDF | - |
| `powerpoint-to-pdf` | PowerPoint vers PDF | - |
| `html-to-pdf` | HTML vers PDF | - (ressources distantes désactivées) |
| `markdown-to-docx` | Markdown vers Word | - |
| `markdown-to-html` | Markdown vers HTML | - |
| `markdown-to-pdf` | Markdown vers PDF | - (ressources distantes désactivées) |
| `epub-convert` | Convertir un EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Convertir en EPUB | - (accepte .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR de PDF (IA) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF vers image | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF vers JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF vers PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF vers TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Outils de fichiers {#file-tools}

| ID de l'outil | Nom | Paramètres principaux |
|---------|------|-------------|
| `chart-maker` | Créateur de graphiques | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV vers Excel | `sheet` (numéro de feuille de calcul pour l'entrée XLSX) - bidirectionnel |
| `csv-json` | CSV vers JSON | `pretty` (bool) - bidirectionnel |
| `json-xml` | JSON vers XML | `pretty` (bool) - bidirectionnel |
| `split-csv` | Diviser un CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Fusionner des CSV | - (multi-fichiers, colonnes correspondantes) |
| `yaml-json` | YAML / JSON | - (bidirectionnel) |
| `xml-to-csv` | XML vers CSV | - (trouve automatiquement les éléments répétés) |
| `excel-to-csv` | Excel vers CSV | préréglage de conversion dédié adossé à `convert-spreadsheet` |
| `create-zip` | Créer un ZIP | - (multi-fichiers, 2-50 fichiers) |
| `extract-zip` | Extraire un ZIP | - (protégé contre les bombes) |

### HTML vers image {#html-to-image}

Capturez une page web sous forme d'image. Contrairement aux autres outils, ce point de terminaison accepte `application/json` au lieu de données de formulaire multipart (aucun téléversement de fichier nécessaire).

**Point de terminaison :** `POST /api/v1/tools/image/html-to-image`

**Content-Type :** `application/json`

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `url` | string | (requis) | URL à capturer (http/https uniquement) |
| `format` | string | `"png"` | Format de sortie : `jpg`, `png`, `webp` |
| `quality` | number | `90` | Qualité 1-100 (JPG/WebP uniquement) |
| `fullPage` | boolean | `false` | Capturer la page entière défilable |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Largeur personnalisée de la fenêtre d'affichage 320-3840 |
| `viewportHeight` | number | `720` | Hauteur personnalisée de la fenêtre d'affichage 320-2160 |

**Exemple :**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Réponse :**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Sous-routes des outils {#tool-sub-routes}

Certains outils exposent des points de terminaison supplémentaires au-delà du `POST /api/v1/tools/<section>/<toolId>` standard :

| Méthode | Chemin | Description |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Renvoie les ID d'outils populaires, en se rabattant sur une liste par défaut sélectionnée lorsque les données d'utilisation sont rares |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Applique des effets d'arrière-plan (couleur/dégradé/flou/ombre) sans réexécuter l'IA. Utilise le masque mis en cache lors de la suppression initiale. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Lit les métadonnées EXIF/IPTC/XMP existantes d'une image |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspecte les champs de métadonnées avant leur suppression |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Phase 1 : détection de visage par IA + suppression de l'arrière-plan. Renvoie les points de repère du visage et les données mises en cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Phase 2 : rognage, redimensionnement et disposition en mosaïque à partir de l'analyse mise en cache. Aucune réexécution de l'IA. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Récupère les métadonnées du GIF (nombre d'images, dimensions, durée) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Récupère les métadonnées du PDF (nombre de pages, dimensions) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Génère un aperçu d'une page PDF spécifique |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Récupère les métadonnées du PDF pour le préréglage JPG dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Génère un aperçu de page PDF au format préréglé JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Récupère les métadonnées du PDF pour le préréglage PNG dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Génère un aperçu de page PDF au format préréglé PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Récupère les métadonnées du PDF pour le préréglage TIFF dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Génère un aperçu de page PDF au format préréglé TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Convertit en lot plusieurs SVG vers du matriciel |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analyse la qualité de l'image et renvoie des recommandations d'amélioration |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Aperçu léger pour l'ajustement en direct des paramètres. Renvoie une image optimisée avec des en-têtes de taille. |

## Traitement par lots {#batch-processing}

Appliquez un outil générique compatible avec le traitement par lots à plusieurs fichiers à la fois. Renvoie une archive ZIP. Les routes personnalisées multi-fichiers ou multi-étapes, telles que la signature de PDF et les routes de préréglage PDF vers image, utilisent leur propre contrat de point de terminaison au lieu de la route générique `/batch`.

L'outil `ocr-pdf` prend en charge cette route générique `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

La concurrence est contrôlée par `CONCURRENT_JOBS` (par défaut : détecté automatiquement à partir des cœurs CPU). `MAX_BATCH_SIZE` limite le nombre de fichiers par lot (par défaut : 100 ; définissez 0 pour illimité).

## Pipelines {#pipelines}

### Exécuter un pipeline {#execute-a-pipeline}

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

La sortie de chaque étape constitue l'entrée de l'étape suivante. Les pipelines autorisent 20 étapes par défaut, configurable via `MAX_PIPELINE_STEPS`. Définissez `MAX_PIPELINE_STEPS=0` pour supprimer la limite.

### Enregistrer et gérer les pipelines {#save-and-manage-pipelines}

| Méthode | Chemin | Description |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Enregistre un pipeline nommé (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Liste les pipelines enregistrés (les administrateurs voient tout ; les utilisateurs voient les leurs) |
| `DELETE` | `/api/v1/pipeline/:id` | Supprime (propriétaire ou administrateur) |
| `GET` | `/api/v1/pipeline/tools` | Liste les ID d'outils valides pour les étapes de pipeline |

## Suivi de la progression {#progress-tracking}

Les tâches de longue durée, les outils mis en file d'attente, les tâches par lots et les pipelines émettent une progression en temps réel via Server-Sent Events. Le flux de progression est public et indexé par ID de tâche, de sorte que les clients n'ont pas besoin d'envoyer d'en-tête d'autorisation pour le lire.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Format des événements :
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Vous pouvez demander l'annulation d'une tâche en file d'attente ou en cours d'exécution avec `POST /api/v1/jobs/:jobId/cancel`. La réponse est `{"canceled":true|false}`.

## Bibliothèque de fichiers {#file-library}

Stockage de fichiers persistant avec historique des versions.

| Méthode | Chemin | Description |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Téléverse des fichiers dans l'espace de travail (traitement temporaire) |
| `POST` | `/api/v1/files/upload` | Téléverse des fichiers dans la bibliothèque de fichiers persistante |
| `POST` | `/api/v1/files/save-result` | Enregistre le résultat du traitement d'un outil comme nouvelle version de fichier |
| `GET` | `/api/v1/files` | Liste les fichiers enregistrés (paginé, avec recherche) |
| `GET` | `/api/v1/files/:id` | Récupère les métadonnées du fichier + la chaîne de versions |
| `GET` | `/api/v1/files/:id/download` | Télécharge un fichier |
| `GET` | `/api/v1/files/:id/thumbnail` | Récupère une miniature JPEG de 300 px |
| `DELETE` | `/api/v1/files` | Supprime en masse des fichiers et leurs chaînes de versions (corps : `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Récupère des URL distantes dans l'espace de travail pour les imports basés sur URL |
| `POST` | `/api/v1/preview` | Génère un aperçu WebP compatible avec le navigateur (pour les formats HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Diffuse un aperçu mis en cache ou généré, compatible avec le navigateur, pour un PDF, un document bureautique, une vidéo ou un fichier audio enregistré |
| `POST` | `/api/v1/preview/generate` | Génère à la demande un aperçu MP4 ou MP3 pour un fichier multimédia téléversé sans l'enregistrer au préalable |
| `GET` | `/api/v1/download/:jobId/:filename` | Télécharge un fichier traité depuis un espace de travail |

Pour enregistrer automatiquement le résultat d'un outil dans la bibliothèque, incluez `fileId` comme champ de formulaire multipart référençant un fichier existant de la bibliothèque. Le résultat traité sera enregistré comme nouvelle version.

## Gestion des clés d'API {#api-key-management}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Génère une nouvelle clé - affichée une seule fois |
| `GET` | `/api/v1/api-keys` | Auth | Liste les clés (name, id, lastUsedAt - pas la clé brute) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Supprime une clé |

## Équipes {#teams}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Liste les équipes |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Crée une équipe |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Renomme une équipe |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Supprime une équipe (impossible de supprimer l'équipe par défaut ou les équipes ayant des membres) |

## Paramètres {#settings}

Configuration clé-valeur d'exécution (lecture par tout utilisateur authentifié, écriture par l'administrateur uniquement).

| Méthode | Chemin | Description |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Récupère tous les paramètres |
| `PUT` | `/api/v1/settings` | Met à jour en masse les paramètres (corps JSON avec des paires clé-valeur) |
| `GET` | `/api/v1/settings/:key` | Récupère un paramètre spécifique par clé |

Clés connues : `disabledTools` (tableau JSON d'ID d'outils), `enableExperimentalTools` (chaîne booléenne), `loginAttemptLimit` (nombre).

## Préférences {#preferences}

Les préférences par utilisateur sont distinctes des paramètres de l'instance. Tout utilisateur authentifié peut lire et mettre à jour sa propre carte de préférences.

| Méthode | Chemin | Description |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Récupère les préférences de l'utilisateur actuel sous forme de `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Insère ou met à jour une ou plusieurs clés de préférence pour l'utilisateur actuel |

## Rôles {#roles}

Gestion de rôles personnalisés avec des autorisations granulaires.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Liste tous les rôles avec le nombre d'utilisateurs |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Crée un rôle personnalisé (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Met à jour un rôle personnalisé (impossible de modifier les rôles intégrés) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Supprime un rôle personnalisé (impossible de supprimer les rôles intégrés ; les utilisateurs concernés reviennent au rôle `user`) |

Autorisations disponibles (17) : `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Journal d'audit {#audit-log}

Point de terminaison réservé aux administrateurs pour examiner les actions pertinentes en matière de sécurité.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Journal d'audit paginé avec filtres optionnels |

Paramètres de requête :

| Paramètre | Description |
|-----------|-------------|
| `page` | Numéro de page (par défaut : 1) |
| `limit` | Entrées par page (par défaut : 50, max : 100) |
| `action` | Filtre par type d'action (par exemple `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtre par adresse IP source |
| `from` | Filtre les entrées postérieures à cette date ISO 8601 |
| `to` | Filtre les entrées antérieures à cette date ISO 8601 |

## Analytique {#analytics}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | Récupère la configuration d'analytique effective (clé PostHog, DSN Sentry, taux d'échantillonnage). Les clés, le DSN et l'ID d'instance sont vides lorsque l'analytique est désactivée, que ce soit par la compilation ou par le paramètre d'instance `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Soumet un retour utilisateur explicite au projet PostHog configuré sous forme de `feedback_submitted`. La route respecte le verrou d'analytique, limite le débit des soumissions, retire les champs de contact sauf si `contactOk` est vrai, et n'accepte jamais le contenu des fichiers, les noms de fichiers, les chemins de téléversement ni le texte d'erreur privé brut. Lorsque l'analytique est désactivée, elle renvoie `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Définit le refus à l'échelle de l'instance. Envoyez un corps JSON `{ "analyticsEnabled": "false" }` pour désactiver l'analytique pour tout le monde, ou `"true"` pour la réactiver. |

## Fonctionnalités / Bundles d'IA {#features-ai-bundles}

Gérez les bundles de fonctionnalités d'IA (installez/désinstallez des packages de modèles d'IA dans l'environnement Docker). Préférez le point de terminaison d'installation au niveau de l'outil lorsque vous activez un outil depuis une automatisation personnalisée : certains outils d'IA nécessitent plus d'un bundle partagé, et ce point de terminaison ignore les bundles déjà installés en ne mettant en file d'attente que ceux qui manquent.

OCR est une amélioration facultative plutôt qu’une dépendance matérielle. Son niveau `fast` Tesseract fonctionne sans pack ; `POST /api/v1/admin/features/ocr/install` installe le pack RapidOCR signé pour `balanced` et `best` sur Linux amd64 ou arm64. Le runtime OCR précis utilise CPU sur les hôtes CPU uniquement et NVIDIA et nécessite au moins 4 GiB de mémoire effective (la limite cgroup du conteneur configuré, sinon la mémoire hôte). SnapOtter signale `requiredMemoryBytes`, `effectiveMemoryBytes` et une raison de compatibilité `insufficient-memory`, et rejette une installation incompatible avant le téléchargement. Cette exigence de mémoire ne s'applique pas à `fast`. Le pack contient environ 208-234 MiB à télécharger et 409-488 MiB installés, selon la cible ; l'index signé lie les tailles exactes appliquées lors de l'installation.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Liste tous les bundles de fonctionnalités et leur état d'installation |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Installe un bundle de fonctionnalités (asynchrone, renvoie `jobId` pour le suivi de la progression) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Installe chaque bundle requis par un outil ; renvoie l'état par bundle (mis en file d'attente/ignoré) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Désinstalle un bundle de fonctionnalités et nettoie les fichiers de modèle |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Récupère l'utilisation totale du disque par les modèles d'IA |
| `POST` | `/api/v1/admin/features/import` | Administrateur (`features:manage`) | Importez un ensemble d'IA hérité (`file`) ou une version OCR hors ligne signée (`index` plus `archive`) |

Une importation OCR isolée doit inclure le `ocr-runtime-index.json` signé de la version et l'archive de plate-forme correspondante. SnapOtter applique les mêmes vérifications de signature Ed25519, de hachage d'artefact, de compatibilité, d'extraction et de test de fumée que celles utilisées par l'installation en ligne :

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Utilisez l'archive `linux-arm64-cpu-py311` sur arm64. Un artefact signé pour une autre cible est rejeté plutôt qu'installé.

## Opérations d'administration {#admin-operations}

Points de terminaison opérationnels pour l'observabilité, l'assistance, les rapports d'utilisation et l'état des sauvegardes.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Lit le niveau de journalisation d'exécution actuel |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Change le niveau de journalisation d'exécution (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, ou `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Métriques Prometheus au format texte |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Télécharge un ZIP de bundle de diagnostic d'assistance caviardé |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Données du tableau de bord d'utilisation, avec un paramètre de requête `days` optionnel |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Lit les métadonnées de la dernière sauvegarde et l'état de fraîcheur |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Enregistre une sauvegarde terminée (`type`, `sizeBytes` optionnel, `notes` optionnel) |

## API d'entreprise {#enterprise-apis}

Ces routes sont verrouillées par licence selon leur fonctionnalité d'entreprise associée. Elles exigent toujours l'autorisation SnapOtter indiquée.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Exporte les entrées d'audit au format JSON ou CSV avec des filtres |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Exporte la configuration d'instance caviardée, les rôles personnalisés et les équipes |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Importe une configuration, avec exécution à blanc optionnelle |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Lit la liste d'autorisation CIDR configurée |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Met à jour la liste d'autorisation CIDR avec prévention de l'auto-verrouillage |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Liste les blocages juridiques des utilisateurs et des équipes |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Applique ou lève un blocage juridique sur un utilisateur ou une équipe |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Génère un jeton bearer SCIM, renvoyé une seule fois |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Révoque le jeton bearer SCIM actuel |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Lit la configuration de transfert SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Met à jour la configuration de transfert SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Liste les destinations de webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Crée une destination de webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Met à jour une destination de webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Supprime une destination de webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Envoie une charge utile de webhook de test |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Démarre une tâche d'export d'utilisateur RGPD |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Lit l'état de l'export RGPD et l'URL de téléchargement |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Purge définitivement les données d'un utilisateur après confirmation |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Purge définitivement les données d'une équipe après confirmation |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Lit les métadonnées de version de l'application, de la build, de Node et du schéma |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Compare les migrations packagées avec les migrations appliquées |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Exécute les vérifications de préparation à la mise à niveau |

### SCIM 2.0 {#scim-2-0}

Les points de terminaison de découverte SCIM sont publics. Les points de terminaison d'utilisateurs et de groupes exigent le jeton bearer SCIM généré ci-dessus.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Public | Capacités du serveur SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Public | Découverte du schéma SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Public | Découverte des types de ressources SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Jeton SCIM | Liste les utilisateurs, avec un filtre SCIM optionnel |
| `POST` | `/api/v1/scim/v2/Users` | Jeton SCIM | Crée un utilisateur |
| `GET` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Récupère un utilisateur |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Remplace un utilisateur |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Désactive un utilisateur en douceur |
| `GET` | `/api/v1/scim/v2/Groups` | Jeton SCIM | Liste les équipes en tant que groupes SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Jeton SCIM | Crée une équipe |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Récupère une équipe |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Remplace une équipe et l'appartenance au groupe |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Supprime une équipe |

## Modèles de mèmes {#meme-templates}

API d'appui pour l'outil de génération de mèmes.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Liste tous les modèles de mèmes disponibles avec les positions des zones de texte |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Sert l'image du modèle en taille réelle |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Sert la miniature du modèle |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Sert le fichier de police utilisé pour le rendu du texte des mèmes |

## Réponses d'erreur {#error-responses}

Toutes les erreurs renvoient du JSON :

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Statut | Signification |
|--------|---------|
| 400 | Requête invalide / échec de la validation |
| 401 | Non authentifié |
| 403 | Autorisations insuffisantes |
| 404 | Ressource introuvable |
| 413 | Fichier trop volumineux (voir `MAX_UPLOAD_SIZE_MB`) |
| 422 | Échec du traitement après validation |
| 429 | Débit limité (voir `RATE_LIMIT_PER_MIN`) |
| 501 | Le bundle de fonctionnalités d'IA requis n'est pas installé (`FEATURE_NOT_INSTALLED`) |
| 500 | Erreur interne du serveur |
