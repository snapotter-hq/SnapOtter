---
description: "Référence complète de l'API REST. Points de terminaison des outils, traitement par lots, pipelines, bibliothèque de fichiers, authentification, équipes et opérations d'administration."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: 0c9458172177
---

# Référence de l'API REST {#rest-api-reference}

Une documentation d'API interactive avec des exemples de requête/réponse est disponible à l'adresse [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Spécifications lisibles par machine :
- `/api/v1/openapi.yaml` - spécification OpenAPI 3.1
- `/llms.txt` - résumé adapté aux LLM
- `/llms-full.txt` - documentation complète adaptée aux LLM

## Authentification {#authentication}

Tous les points de terminaison exigent une authentification, sauf `AUTH_ENABLED=false`.

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

Les sessions expirent après 7 jours (configurable via `SESSION_DURATION_HOURS`).

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

Les clés sont préfixées `si_` et stockées sous forme de hachages scrypt : la clé brute n'est affichée qu'une seule fois et ne peut plus jamais être récupérée ensuite.

### Points de terminaison d'authentification {#auth-endpoints}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Public | Connexion, obtention d'un jeton de session |
| `POST` | `/api/auth/logout` | Auth | Détruire la session en cours |
| `GET` | `/api/auth/session` | Auth | Valider la session en cours |
| `POST` | `/api/auth/change-password` | Auth | Modifier son propre mot de passe (invalide toutes les autres sessions et clés d'API) |
| `GET` | `/api/auth/users` | Admin | Lister tous les utilisateurs |
| `POST` | `/api/auth/register` | Admin | Créer un nouvel utilisateur |
| `PUT` | `/api/auth/users/:id` | Admin | Mettre à jour le rôle ou l'équipe d'un utilisateur |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Réinitialiser le mot de passe d'un utilisateur |
| `DELETE` | `/api/auth/users/:id` | Admin | Supprimer un utilisateur |
| `GET` | `/api/v1/config/auth` | Public | Vérifier si l'authentification est activée (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Démarrer l'inscription à la MFA TOTP. Nécessite la fonctionnalité enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Confirmer l'inscription à la MFA avec un code TOTP |
| `POST` | `/api/auth/mfa/complete` | Public | Terminer un défi de connexion MFA en attente |
| `POST` | `/api/auth/mfa/disable` | Auth | Désactiver la MFA pour l'utilisateur en cours |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Réinitialiser la MFA d'un utilisateur |
| `GET` | `/api/auth/oidc/login` | Public | Démarrer la connexion OIDC lorsque OIDC est activé |
| `GET` | `/api/auth/oidc/callback` | Public | Rappel d'autorisation OIDC |
| `GET` | `/api/auth/saml/metadata` | Public | XML de métadonnées SP SAML lorsque SAML est activé |
| `GET` | `/api/auth/saml/login` | Public | Démarrer la connexion SAML |
| `POST` | `/api/auth/saml/callback` | Public | Service consommateur d'assertions SAML |

Lorsque la MFA est activée pour un utilisateur, `POST /api/auth/login` renvoie `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` au lieu d'un jeton de session. Envoyez ce `mfaToken` accompagné d'un code TOTP ou d'un code de récupération à `/api/auth/mfa/complete`.

### Permissions {#permissions}

| Permission | Admin | Utilisateur |
|-----------|:-----:|:----:|
| Utiliser les outils | ✓ | ✓ |
| Posséder fichiers/pipelines/clés d'API | ✓ | ✓ |
| Voir les fichiers/pipelines/clés de tous les utilisateurs | ✓ | - |
| Écrire les paramètres | ✓ | - |
| Gérer les utilisateurs et les équipes | ✓ | - |
| Gérer l'image de marque | ✓ | - |

## Contrôle de santé {#health-check}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Public | Contrôle de santé de base. Renvoie `{"status":"healthy","version":"..."}` avec 200, ou `{"status":"unhealthy"}` avec 503 si la base de données est inaccessible. |
| `GET` | `/api/v1/readyz` | Public | Sonde de disponibilité. Vérifie PostgreSQL, Redis, l'espace disque et S3 lorsqu'il est configuré. Renvoie 503 lorsque l'instance ne doit pas recevoir de trafic. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnostics détaillés incluant la durée de fonctionnement, le mode de stockage, l'état de la base de données, l'état de la file d'attente et la disponibilité du GPU. |

## Utilisation des outils {#using-tools}

Chaque outil suit le même modèle :

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

`<section>` est l'un des éléments `image`, `video`, `audio`, `pdf` ou `files`.

- Le téléversement se fait via `multipart/form-data`.
- `settings` est une chaîne JSON contenant des options spécifiques à l'outil.
- `clientJobId` est un champ de formulaire facultatif pour la corrélation de progression fournie par l'appelant.
- `fileId` est un champ de formulaire facultatif référençant un élément existant de la bibliothèque de fichiers. Lorsqu'il est présent, la sortie traitée est enregistrée comme une nouvelle version et la réponse inclut `savedFileId`.
- **Outils rapides** : renvoient généralement un JSON 200 : `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Récupérez le fichier traité depuis `downloadUrl`.
- **Tout outil mis en file d'attente** peut renvoyer un JSON 202 s'il est de longue durée ou s'il dépasse la fenêtre d'attente synchrone : `{"jobId":"...","async":true}`. Connectez-vous au SSE pour la progression, puis téléchargez une fois terminé (voir [Suivi de la progression](#progress-tracking)).
- **Les routes par lots** renvoient une archive ZIP diffusée directement (avec l'en-tête `X-Job-Id`) pour les outils enregistrés dans le registre de lots générique.

## Référence des outils {#tools-reference}

### Préréglages de conversion {#conversion-presets}

Le catalogue partagé comprend 83 points de terminaison de préréglages de conversion dédiés tels que `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` et `excel-to-csv`. Les préréglages sont des routes d'outils à part entière :

`POST /api/v1/tools/<section>/<presetId>`

Chaque préréglage verrouille le format de sortie et délègue à un outil de base tel que `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` ou `convert-spreadsheet`. Consultez [Préréglages de conversion](/fr/tools/conversion-presets) pour la table de routes complète et les paramètres facultatifs.

### Essentiels {#essentials}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `resize` | Redimensionner | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, plus 23 préréglages pour les réseaux sociaux |
| `crop` | Rogner | `left`, `top`, `width`, `height`, `unit` (px/pourcentage) |
| `rotate` | Pivoter et retourner | `angle`, `horizontal` (booléen), `vertical` (booléen) |
| `convert` | Convertir | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Compresser | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimisation {#optimization}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `optimize-for-web` | Optimiser pour le Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Supprimer les métadonnées | - |
| `edit-metadata` | Modifier les métadonnées | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Renommage en masse | `pattern` (prend en charge `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Image vers PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Générateur de favicon | `padding`, `backgroundColor`, `borderRadius` - génère toutes les tailles standard |

### Ajustements {#adjustments}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `adjust-colors` | Ajuster les couleurs | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Accentuation | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Remplacer une couleur | `sourceColor`, `targetColor` (remplacement), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulation de daltonisme | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, par défaut "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixeliser | `blockSize` (2-128), `region` ({left, top, width, height} pour une pixelisation partielle) |
| `vignette` | Vignettage | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Outils d'IA {#ai-tools}

Tous les outils d'IA s'exécutent sur votre matériel : sur le CPU par défaut, ou sur NVIDIA CUDA lorsqu'un GPU NVIDIA pris en charge est disponible. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence d'IA à ce jour. Aucune connexion internet n'est requise.

| ID de l'outil | Nom | Modèle d'IA | Paramètres clés |
|---------|------|---------|-------------|
| `remove-background` | Supprimer l'arrière-plan | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Agrandissement d'image | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Gomme d'objet | LaMa (ONNX) | Masque envoyé comme deuxième partie de fichier (nom de champ `mask`), `format`, `quality` |
| `ocr` | OCR / Extraction de texte | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Floutage de visage / d'informations personnelles | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Rognage intelligent | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Amélioration d'image | Basée sur l'analyse | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Amélioration de visage | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Colorisation par IA | DDColor | `intensity`, `model` |
| `noise-removal` | Suppression du bruit | Débruitage par paliers | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Suppression des yeux rouges | Points de repère du visage + analyse des couleurs | `sensitivity`, `strength` |
| `restore-photo` | Restauration de photo | Pipeline multi-étapes | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Photo d'identité | Points de repère MediaPipe | Flux en deux phases. L'analyse utilise du multipart `file` ; la génération utilise du JSON avec `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), les points de repère et les dimensions de l'image |
| `content-aware-resize` | Redimensionnement sensible au contenu | Découpage par couture (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Correcteur de transparence PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Remplacer l'arrière-plan | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Flouter l'arrière-plan | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Extension de toile par IA | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Filigrane et superposition {#watermark-overlay}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `watermark-text` | Filigrane texte | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Filigrane image | `opacity`, `position`, `scale` - le deuxième fichier est le filigrane |
| `text-overlay` | Superposition de texte | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Composition d'image | `x`, `y`, `opacity`, `blend` - le deuxième fichier est superposé par-dessus |
| `meme-generator` | Générateur de mèmes | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Prend en charge le mode modèle (corps JSON avec `templateId`) ou le mode image personnalisée (multipart avec fichier). |

### Utilitaires {#utilities}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `info` | Infos sur l'image | - (renvoie width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Comparer des images | `mode` (side-by-side/overlay/diff), `diffThreshold` - le deuxième fichier est la cible de comparaison |
| `find-duplicates` | Trouver les doublons | `threshold` (distance de hachage perceptuel, par défaut 8) - multi-fichier |
| `color-palette` | Palette de couleurs | `count` (nombre de couleurs dominantes), `format` (hex/rgb) |
| `qr-generate` | Générateur de code QR | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (fichier facultatif) |
| `barcode-read` | Lecteur de code-barres | - (détecte automatiquement QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Image vers Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML vers image | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogramme | `scale` (linear/log) - renvoie un graphique d'histogramme RGB + des statistiques par canal |
| `lqip-placeholder` | Espace réservé LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Générateur de code-barres | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (booléen). Corps JSON, sans téléversement de fichier. |

### Mise en page et composition {#layout-composition}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `collage` | Collage / Grille | `template` (25+ dispositions), `gap`, `backgroundColor`, `borderRadius` - multi-fichier |
| `stitch` | Assembler / Combiner | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-fichier |
| `split` | Découpage d'image | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Bordure et cadre | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Embellir une capture d'écran | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Rognage circulaire | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Marge d'image | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Feuille de sprites | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - multi-fichier (2-64 images) |

### Format et conversion {#format-conversion}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `svg-to-raster` | SVG vers matriciel | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image vers SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Outils GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), paramètres spécifiques à l'action |
| `gif-webp` | Convertisseur GIF/WebP | `quality` (1-100), `lossless` (booléen), `resizePercent` (10-100) |

### Outils vidéo {#video-tools}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `convert-video` | Convertir une vidéo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Compresser une vidéo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Rogner une vidéo (durée) | `startS`, `endS`, `precise` (booléen, coupe précise à l'image) |
| `mute-video` | Couper le son d'une vidéo | - |
| `video-to-gif` | Vidéo vers GIF | `fps` (1-30), `width`, `startS`, `durationS` (max 60 s) |
| `resize-video` | Redimensionner une vidéo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Rogner une vidéo (cadre) | `width`, `height`, `x`, `y` |
| `rotate-video` | Pivoter une vidéo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Modifier la fréquence d'images | `fps` (1-120) |
| `video-color` | Couleur de vidéo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Vitesse de vidéo | `factor` (0.25-4), `keepPitch` (booléen) |
| `reverse-video` | Inverser une vidéo | - (max 5 minutes) |
| `video-loudnorm` | Normaliser l'audio | - (EBU R128) |
| `aspect-pad` | Marge selon le ratio | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Marge floute | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Filigrane sur vidéo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabiliser une vidéo | `smoothing` (5-60, en images) |
| `gif-to-video` | GIF vers vidéo | `format` (mp4/webm/mov) |
| `video-to-webp` | Vidéo vers WebP | `fps`, `width`, `quality`, `loop` (booléen) |
| `video-to-frames` | Vidéo vers images | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Fusionner des vidéos | - (multi-fichier, normalisé à la résolution de la première vidéo) |
| `replace-audio` | Remplacer l'audio | - (fichier vidéo + audio, deux fichiers) |
| `burn-subtitles` | Incruster des sous-titres | `fontSize` (8-72) - fichier vidéo + sous-titres |
| `embed-subtitles` | Intégrer des sous-titres | `language` (code ISO 639-2/B) - fichier vidéo + sous-titres |
| `extract-subtitles` | Extraire des sous-titres | - (produit du SRT) |
| `images-to-video` | Images vers vidéo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - multi-fichier |
| `video-metadata` | Nettoyer les métadonnées vidéo | - |
| `auto-subtitles` | Sous-titres automatiques (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extraire l'audio | `format` (mp3/wav/m4a/ogg) |

### Outils audio {#audio-tools}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `convert-audio` | Convertir l'audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Rogner l'audio | `startS`, `endS` |
| `volume-adjust` | Ajuster le volume | `gainDb` (-30 à 30) |
| `normalize-audio` | Normaliser l'audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fondu audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Inverser l'audio | - |
| `audio-speed` | Vitesse audio | `factor` (0.25-4) |
| `pitch-shift` | Décalage de hauteur | `semitones` (-12 à 12) |
| `audio-channels` | Canaux audio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Suppression des silences | `thresholdDb` (-80 à -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Réduction du bruit | `strength` (light/medium/strong) |
| `merge-audio` | Fusionner l'audio | `format` (mp3/wav/flac/m4a) - multi-fichier |
| `split-audio` | Diviser l'audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Créateur de sonnerie | `startS`, `durationS` (1-30) |
| `waveform-image` | Image de forme d'onde | `width`, `height`, `color` (hex) |
| `audio-metadata` | Métadonnées audio | `strip` (booléen), `title`, `artist`, `album` |
| `transcribe-audio` | Transcrire l'audio (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Outils de documents {#document-tools}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `merge-pdf` | Fusionner des PDF | - (multi-fichier, jusqu'à 20 PDF) |
| `split-pdf` | Diviser un PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Compresser un PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Pivoter un PDF | `angle` (90/180/270), `range` (plage de pages) |
| `extract-pages` | Extraire des pages | `range` (syntaxe qpdf, p. ex. "1-5,8,10-z") |
| `remove-pages` | Supprimer des pages | `pages` (plage qpdf à supprimer) |
| `organize-pdf` | Organiser un PDF | `order` (ordre des pages qpdf, p. ex. "3,1,2,5-z") |
| `protect-pdf` | Protéger un PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Déverrouiller un PDF | `password` |
| `repair-pdf` | Réparer un PDF | - |
| `linearize-pdf` | Optimiser un PDF pour le Web | - (linéarise pour un affichage web rapide) |
| `grayscale-pdf` | PDF en niveaux de gris | - |
| `pdfa-convert` | Conversion PDF/A | - (PDF/A-2 d'archivage) |
| `crop-pdf` | Rogner un PDF | `margin` (0-2000 points) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Livret PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Filigrane PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Numéros de page PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Aplatir un PDF | - (intègre les formulaires et les annotations) |
| `redact-pdf` | Caviarder un PDF | `terms` (string[]), `caseSensitive` (booléen) |
| `sign-pdf` | Signer un PDF | Route multipart personnalisée avec le PDF `file`, les fichiers de signature `sig0`, `sig1` et un tableau JSON `placements` |
| `pdf-to-text` | PDF vers texte | - |
| `pdf-to-word` | PDF vers Word | - |
| `pdf-metadata` | Métadonnées PDF | `title`, `author`, `subject`, `keywords` |
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
| `to-epub` | Convertir vers EPUB | - (accepte .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR PDF (IA) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF vers image | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF vers JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF vers PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF vers TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Outils de fichiers {#file-tools}

| ID de l'outil | Nom | Paramètres clés |
|---------|------|-------------|
| `chart-maker` | Créateur de graphiques | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV vers Excel | `sheet` (numéro de feuille de calcul pour une entrée XLSX) - bidirectionnel |
| `csv-json` | CSV vers JSON | `pretty` (booléen) - bidirectionnel |
| `json-xml` | JSON vers XML | `pretty` (booléen) - bidirectionnel |
| `split-csv` | Diviser un CSV | `rowsPerFile` (1-1000000), `keepHeader` (booléen) |
| `merge-csvs` | Fusionner des CSV | - (multi-fichier, colonnes correspondantes) |
| `yaml-json` | YAML / JSON | - (bidirectionnel) |
| `xml-to-csv` | XML vers CSV | - (trouve automatiquement les éléments répétés) |
| `excel-to-csv` | Excel vers CSV | préréglage de conversion dédié s'appuyant sur `convert-spreadsheet` |
| `create-zip` | Créer un ZIP | - (multi-fichier, 2-50 fichiers) |
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
| `fullPage` | boolean | `false` | Capturer la page entière avec défilement |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Largeur de fenêtre personnalisée 320-3840 |
| `viewportHeight` | number | `720` | Hauteur de fenêtre personnalisée 320-2160 |

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
| `GET` | `/api/v1/tools/popular` | Renvoie les ID d'outils populaires, en se rabattant sur une liste par défaut curée lorsque les données d'utilisation sont rares |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Appliquer des effets d'arrière-plan (color/gradient/blur/shadow) sans relancer l'IA. Utilise le masque mis en cache lors de la suppression initiale. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Lire les métadonnées EXIF/IPTC/XMP existantes d'une image |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspecter les champs de métadonnées avant leur suppression |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Phase 1 : détection de visage par IA + suppression de l'arrière-plan. Renvoie les points de repère du visage et les données mises en cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Phase 2 : rogner, redimensionner et disposer en mosaïque à l'aide de l'analyse mise en cache. Pas de nouvelle exécution de l'IA. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Obtenir les métadonnées GIF (nombre d'images, dimensions, durée) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Obtenir les métadonnées PDF (nombre de pages, dimensions) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Générer un aperçu d'une page PDF spécifique |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Obtenir les métadonnées PDF pour le préréglage JPG dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Générer un aperçu de page PDF au format préréglage JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Obtenir les métadonnées PDF pour le préréglage PNG dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Générer un aperçu de page PDF au format préréglage PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Obtenir les métadonnées PDF pour le préréglage TIFF dédié |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Générer un aperçu de page PDF au format préréglage TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Convertir en lot plusieurs SVG en matriciel |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analyser la qualité de l'image et renvoyer des recommandations d'amélioration |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Aperçu léger pour le réglage en direct des paramètres. Renvoie une image optimisée avec des en-têtes de taille. |

## Traitement par lots {#batch-processing}

Appliquez un outil générique compatible avec le traitement par lots à plusieurs fichiers à la fois. Renvoie une archive ZIP. Les routes personnalisées multi-fichiers ou multi-étapes, telles que la signature de PDF, l'OCR de PDF et les routes de préréglages PDF vers image, utilisent leur propre contrat de point de terminaison au lieu de la route générique `/batch`.

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
| `POST` | `/api/v1/pipeline/save` | Enregistrer un pipeline nommé (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lister les pipelines enregistrés (les admins voient tout ; les utilisateurs voient les leurs) |
| `DELETE` | `/api/v1/pipeline/:id` | Supprimer (propriétaire ou admin) |
| `GET` | `/api/v1/pipeline/tools` | Lister les ID d'outils valides pour les étapes de pipeline |

## Suivi de la progression {#progress-tracking}

Les tâches de longue durée, les outils mis en file d'attente, les tâches par lots et les pipelines émettent une progression en temps réel via des Server-Sent Events. Le flux de progression est public et indexé par l'ID de la tâche, de sorte que les clients n'ont pas besoin d'envoyer d'en-tête Authorization pour le lire.

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
| `POST` | `/api/v1/upload` | Téléverser des fichiers vers l'espace de travail (traitement temporaire) |
| `POST` | `/api/v1/files/upload` | Téléverser des fichiers vers la bibliothèque de fichiers persistante |
| `POST` | `/api/v1/files/save-result` | Enregistrer le résultat du traitement d'un outil comme une nouvelle version de fichier |
| `GET` | `/api/v1/files` | Lister les fichiers enregistrés (paginé, avec recherche) |
| `GET` | `/api/v1/files/:id` | Obtenir les métadonnées du fichier + la chaîne de versions |
| `GET` | `/api/v1/files/:id/download` | Télécharger un fichier |
| `GET` | `/api/v1/files/:id/thumbnail` | Obtenir une miniature JPEG de 300 px |
| `DELETE` | `/api/v1/files` | Supprimer en masse des fichiers et leurs chaînes de versions (corps : `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Récupérer des URL distantes dans l'espace de travail pour des imports basés sur URL |
| `POST` | `/api/v1/preview` | Générer un aperçu WebP compatible navigateur (pour les formats HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Diffuser un aperçu compatible navigateur, mis en cache ou généré, pour un PDF, un document bureautique, une vidéo ou un fichier audio enregistré |
| `POST` | `/api/v1/preview/generate` | Générer à la demande un aperçu MP4 ou MP3 pour un fichier média téléversé sans l'enregistrer au préalable |
| `GET` | `/api/v1/download/:jobId/:filename` | Télécharger un fichier traité depuis un espace de travail |

Pour enregistrer automatiquement le résultat d'un outil dans la bibliothèque, incluez `fileId` comme champ de formulaire multipart référençant un fichier existant de la bibliothèque. Le résultat traité sera enregistré comme une nouvelle version.

## Gestion des clés d'API {#api-key-management}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Générer une nouvelle clé - affichée une seule fois |
| `GET` | `/api/v1/api-keys` | Auth | Lister les clés (name, id, lastUsedAt - pas la clé brute) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Supprimer une clé |

## Équipes {#teams}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Lister les équipes |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Créer une équipe |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Renommer une équipe |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Supprimer une équipe (impossible de supprimer l'équipe par défaut ou des équipes ayant des membres) |

## Paramètres {#settings}

Configuration clé-valeur d'exécution (lisible par tout utilisateur authentifié, modifiable par un admin uniquement).

| Méthode | Chemin | Description |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Obtenir tous les paramètres |
| `PUT` | `/api/v1/settings` | Mettre à jour en masse les paramètres (corps JSON avec des paires clé-valeur) |
| `GET` | `/api/v1/settings/:key` | Obtenir un paramètre spécifique par clé |

Clés connues : `disabledTools` (tableau JSON d'ID d'outils), `enableExperimentalTools` (chaîne booléenne), `loginAttemptLimit` (nombre).

## Préférences {#preferences}

Les préférences par utilisateur sont distinctes des paramètres de l'instance. Tout utilisateur authentifié peut lire et mettre à jour sa propre carte de préférences.

| Méthode | Chemin | Description |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Obtenir les préférences de l'utilisateur en cours sous forme de `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Insérer ou mettre à jour une ou plusieurs clés de préférences pour l'utilisateur en cours |

## Rôles {#roles}

Gestion de rôles personnalisés avec des permissions granulaires.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Lister tous les rôles avec le nombre d'utilisateurs |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Créer un rôle personnalisé (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Mettre à jour un rôle personnalisé (impossible de modifier les rôles intégrés) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Supprimer un rôle personnalisé (impossible de supprimer les rôles intégrés ; les utilisateurs concernés reviennent au rôle `user`) |

Permissions disponibles (17) : `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Journal d'audit {#audit-log}

Point de terminaison réservé aux admins pour examiner les actions liées à la sécurité.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Journal d'audit paginé avec filtres facultatifs |

Paramètres de requête :

| Paramètre | Description |
|-----------|-------------|
| `page` | Numéro de page (par défaut : 1) |
| `limit` | Entrées par page (par défaut : 50, max : 100) |
| `action` | Filtrer par type d'action (p. ex. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtrer par adresse IP source |
| `from` | Filtrer les entrées après cette date ISO 8601 |
| `to` | Filtrer les entrées avant cette date ISO 8601 |

## Analytique {#analytics}

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Public | Obtenir la configuration analytique effective (clé PostHog, DSN Sentry, taux d'échantillonnage). Les clés, le DSN et l'ID d'instance sont vides lorsque l'analytique est désactivée, que ce soit par la fixation à la compilation ou par le paramètre d'instance `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Soumettre un retour utilisateur explicite au projet PostHog configuré sous la forme `feedback_submitted`. La route respecte la barrière analytique, limite le débit des soumissions, supprime les champs de contact sauf si `contactOk` est vrai, et n'accepte jamais le contenu des fichiers, les noms de fichiers, les chemins de téléversement ni le texte d'erreur privé brut. Lorsque l'analytique est désactivée, elle renvoie `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Définir le désengagement à l'échelle de l'instance. Envoyez un corps JSON `{ "analyticsEnabled": "false" }` pour désactiver l'analytique pour tout le monde, ou `"true"` pour la réactiver. |

## Fonctionnalités / Bundles d'IA {#features-ai-bundles}

Gérez les bundles de fonctionnalités d'IA (installez/désinstallez des paquets de modèles d'IA dans l'environnement Docker).

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Lister tous les bundles de fonctionnalités et leur état d'installation |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Installer un bundle de fonctionnalités (asynchrone, renvoie `jobId` pour le suivi de la progression) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Désinstaller un bundle de fonctionnalités et nettoyer les fichiers de modèles |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Obtenir l'utilisation totale du disque par les modèles d'IA |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Importer une archive de bundle d'IA hors ligne |

## Opérations d'administration {#admin-operations}

Points de terminaison opérationnels pour l'observabilité, le support, les rapports d'utilisation et l'état des sauvegardes.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Lire le niveau de journalisation d'exécution actuel |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Modifier le niveau de journalisation d'exécution (`fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Métriques Prometheus au format texte |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Télécharger un ZIP de bundle de support de diagnostic caviardé |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Données du tableau de bord d'utilisation, avec un paramètre de requête `days` facultatif |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Lire les métadonnées de la dernière sauvegarde et l'état de fraîcheur |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Enregistrer une sauvegarde terminée (`type`, `sizeBytes` facultatif, `notes` facultatif) |

## API Enterprise {#enterprise-apis}

Ces routes sont soumises à une licence par leur fonctionnalité enterprise associée. Elles exigent toujours la permission SnapOtter indiquée.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Exporter les entrées d'audit au format JSON ou CSV avec des filtres |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Exporter la configuration d'instance caviardée, les rôles personnalisés et les équipes |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Importer la configuration, avec exécution à blanc facultative |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Lire la liste d'autorisation CIDR configurée |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Mettre à jour la liste d'autorisation CIDR avec prévention de l'auto-verrouillage |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Lister les conservations à des fins juridiques des utilisateurs et des équipes |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Appliquer ou lever une conservation à des fins juridiques sur un utilisateur ou une équipe |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Générer un jeton porteur SCIM, renvoyé une seule fois |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Révoquer le jeton porteur SCIM actuel |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Lire la configuration de transfert SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Mettre à jour la configuration de transfert SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Lister les destinations de webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Créer une destination de webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Mettre à jour une destination de webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Supprimer une destination de webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Envoyer une charge utile de webhook de test |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Démarrer une tâche d'export utilisateur RGPD |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Lire l'état de l'export RGPD et l'URL de téléchargement |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Purger définitivement les données d'un utilisateur après confirmation |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Purger définitivement les données d'une équipe après confirmation |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Lire les métadonnées de version de l'application, de la build, de Node et du schéma |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Comparer les migrations empaquetées avec les migrations appliquées |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Exécuter les vérifications de préparation à la mise à niveau |

### SCIM 2.0 {#scim-2-0}

Les points de terminaison de découverte SCIM sont publics. Les points de terminaison d'utilisateurs et de groupes exigent le jeton porteur SCIM généré ci-dessus.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Public | Capacités du serveur SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Public | Découverte de schéma SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Public | Découverte de type de ressource SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Jeton SCIM | Lister les utilisateurs, avec un filtre SCIM facultatif |
| `POST` | `/api/v1/scim/v2/Users` | Jeton SCIM | Créer un utilisateur |
| `GET` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Obtenir un utilisateur |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Remplacer un utilisateur |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Jeton SCIM | Désactiver en douceur un utilisateur |
| `GET` | `/api/v1/scim/v2/Groups` | Jeton SCIM | Lister les équipes sous forme de groupes SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Jeton SCIM | Créer une équipe |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Obtenir une équipe |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Remplacer une équipe et l'appartenance au groupe |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Jeton SCIM | Supprimer une équipe |

## Modèles de mèmes {#meme-templates}

API de support pour l'outil générateur de mèmes.

| Méthode | Chemin | Accès | Description |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Lister tous les modèles de mèmes disponibles avec les positions des zones de texte |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Servir l'image du modèle en taille réelle |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Servir la miniature du modèle |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Servir le fichier de police utilisé pour le rendu du texte des mèmes |

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
| 403 | Permissions insuffisantes |
| 404 | Ressource introuvable |
| 413 | Fichier trop volumineux (voir `MAX_UPLOAD_SIZE_MB`) |
| 422 | Échec du traitement après validation |
| 429 | Débit limité (voir `RATE_LIMIT_PER_MIN`) |
| 501 | Le bundle de fonctionnalités d'IA requis n'est pas installé (`FEATURE_NOT_INSTALLED`) |
| 500 | Erreur interne du serveur |
