---
description: "Référence du moteur d'IA avec tous les outils de ML locaux. Suppression d'arrière-plan, agrandissement, OCR, détection de visages, restauration de photos, et plus encore."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: b331443c08b8
---

# Référence du moteur d'IA {#ai-engine-reference}

Le paquet `@snapotter/ai` relie Node.js à un **sidecar Python persistant** pour toutes les opérations de ML. Le processus de répartition reste actif entre les requêtes pour des performances rapides à démarrage à chaud. NVIDIA CUDA est détecté automatiquement au démarrage et utilisé lorsqu'il est disponible ; sinon, les outils d'IA s'exécutent sur le CPU.

L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence d'IA aujourd'hui. Le mappage de `/dev/dri` dans un conteneur n'accélère pas ces outils du sidecar Python à moins qu'un GPU NVIDIA compatible CUDA ne soit disponible.

19 outils d'IA du sidecar Python répartis sur quatre modalités (image, audio, vidéo, document), plus 2 outils avec des capacités d'IA optionnelles. Tous les modèles s'exécutent localement : aucune connexion Internet requise après le téléchargement initial des modèles.

## Architecture {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Un profil de répartiteur « docs » distinct remplace la liste d'autorisation d'IA par des scripts de traitement de documents (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) et ignore les lourdes importations de ML.

**Délais d'expiration :** 300 s par défaut ; l'OCR et la suppression d'arrière-plan BiRefNet disposent de 600 s.

## Groupes de fonctionnalités {#feature-bundles}

Les modèles d'IA sont regroupés par pile de dépendances partagée, et non par une archive par outil. Un groupe de fonctionnalités peut activer plusieurs outils lorsqu'ils utilisent la même famille de modèles, les mêmes wheels Python ou les mêmes bibliothèques natives. Cela permet de réduire la taille de l'image Docker publiée et d'éviter de stocker des copies en double des mêmes modèles de détourage d'arrière-plan, de détection de visages, d'OCR, de restauration et de reconnaissance vocale.

L'image Docker contient l'application ainsi que l'environnement d'exécution commun. Les grandes archives de modèles sont téléchargées à la demande dans le volume persistant `/data/ai`, puis réutilisées par chaque outil qui en a besoin. Si un groupe est déjà installé parce qu'un autre outil en avait besoin, l'activation d'un nouvel outil dépendant ne télécharge pas ce groupe à nouveau.

Chaque outil d'IA nécessite un ou plusieurs groupes de fonctionnalités avant de pouvoir s'exécuter. L'interface d'administration installe par outil via `POST /api/v1/admin/tools/:toolId/features/install`, qui résout la liste complète des groupes, ignore les groupes déjà installés et met en file d'attente uniquement les téléchargements manquants. Par exemple, l'activation de Photo d'identité sur une instance neuve met en file d'attente `background-removal` et `face-detection` ; son activation après que la Suppression d'arrière-plan est déjà installée ne met en file d'attente que `face-detection`.

| Groupe | Taille | Groupe de dépendances partagé | Outils qui l'utilisent |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 Go | détourage d'arrière-plan rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 Mo | détection de visages et points de repère MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 Go | remplissage/extension par LaMa et DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 Go | RealESRGAN, GFPGAN / CodeFormer, débruitage | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 Go | pipeline de réparation des rayures et de restauration | restore-photo |
| `ocr` | 5-6 Go | pile OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 Mo | modèles de reconnaissance vocale faster-whisper | transcribe-audio, auto-subtitles |

Outils avec des dépendances multi-groupes :

| Outil | Groupes requis | Pourquoi |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Supprime l'arrière-plan, puis utilise les points de repère du visage pour cadrer le recadrage selon les règles des photos de passeport et de pièce d'identité. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Détecte les visages avant d'exécuter l'amélioration GFPGAN ou CodeFormer sur les régions de visage sélectionnées. |

Un outil n'est disponible que lorsque tous ses groupes requis sont installés. Les installations partielles sont valides et sont gérées de manière incrémentale : les groupes installés sont réutilisés, les groupes manquants sont affichés en tant que téléchargements, et les installations en file d'attente s'exécutent une à la fois afin que l'environnement Python partagé ne soit pas modifié simultanément.

---

## Suppression d'arrière-plan {#background-removal}

**Route de l'outil :** `remove-background`  
**Modèle :** rembg avec BiRefNet (par défaut) ou variantes U2-Net

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `model` | string | - | Variante du modèle (remplacement optionnel) |
| `backgroundType` | string | `"transparent"` | L'un de : `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Couleur hexadécimale pour un arrière-plan uni |
| `gradientColor1` | string | - | Première couleur du dégradé |
| `gradientColor2` | string | - | Deuxième couleur du dégradé |
| `gradientAngle` | number | - | Angle du dégradé en degrés |
| `blurEnabled` | boolean | - | Activer l'effet de flou d'arrière-plan |
| `blurIntensity` | number (0-100) | - | Intensité du flou |
| `shadowEnabled` | boolean | - | Activer l'ombre portée sur le sujet |
| `shadowOpacity` | number (0-100) | - | Opacité de l'ombre |
| `outputFormat` | string | - | Format de sortie : `png`, `webp`, ou `avif` |
| `edgeRefine` | integer (0-3) | - | Niveau d'affinement des bords |
| `decontaminate` | boolean | - | Supprimer le débordement de couleur sur les bords |

## Remplacement d'arrière-plan {#background-replace}

**Route de l'outil :** `background-replace`  
**Modèle :** rembg / BiRefNet (partagé avec remove-background)

Supprime l'arrière-plan et le remplace par une couleur unie ou un dégradé.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Mode d'arrière-plan |
| `color` | string | `"#ffffff"` | Couleur hexadécimale de l'arrière-plan (lorsque `backgroundType` vaut `color`) |
| `gradientColor1` | string | - | Première couleur hexadécimale du dégradé |
| `gradientColor2` | string | - | Deuxième couleur hexadécimale du dégradé |
| `gradientAngle` | integer (0-360) | `180` | Angle du dégradé en degrés |
| `feather` | integer (0-20) | `0` | Rayon d'adoucissement des bords |
| `format` | `"png"` \| `"webp"` | `"png"` | Format de sortie |

## Flou d'arrière-plan {#blur-background}

**Route de l'outil :** `blur-background`  
**Modèle :** rembg / BiRefNet (partagé avec remove-background)

Applique un flou à l'arrière-plan tout en gardant le sujet net.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensité du flou |
| `feather` | integer (0-20) | `0` | Rayon d'adoucissement des bords |
| `format` | `"png"` \| `"webp"` | `"png"` | Format de sortie |

## Agrandissement d'image {#image-upscaling}

**Route de l'outil :** `upscale`  
**Modèle :** RealESRGAN (avec repli Lanczos lorsqu'il est indisponible)

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Facteur d'agrandissement |
| `model` | string | `"auto"` | Variante du modèle |
| `faceEnhance` | boolean | `false` | Appliquer une passe d'amélioration des visages GFPGAN |
| `denoise` | number | `0` | Force du débruitage |
| `format` | string | `"auto"` | Remplacement du format de sortie |
| `quality` | number | `95` | Qualité de sortie (1-100) |

## OCR / Extraction de texte {#ocr-text-extraction}

**Route de l'outil :** `ocr`  
**Modèles :** Tesseract (rapide), PaddleOCR PP-OCRv5 (équilibré), PaddleOCR-VL 1.5 (meilleur)

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Niveau de traitement |
| `language` | string | `"auto"` | Langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Prétraiter l'image pour améliorer la précision de l'OCR |
| `engine` | string | - | Déprécié. Fait correspondre `tesseract` à `fast`, `paddleocr` à `balanced` |

Renvoie des résultats structurés avec des cadres de délimitation, des scores de confiance et des blocs de texte extraits.

## OCR de PDF {#pdf-ocr}

**Route de l'outil :** `ocr-pdf`  
**Modèles :** Même système de niveaux que l'OCR d'image

Extrait le texte de documents PDF numérisés à l'aide d'un OCR alimenté par IA, page par page.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Niveau de traitement |
| `language` | string | `"auto"` | Langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Sélection de pages : `"all"`, `"1-3"`, `"1,3,5"` |

## Floutage de visages / PII {#face-pii-blur}

**Route de l'outil :** `blur-faces`  
**Modèle :** détection de visages MediaPipe

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Rayon du flou gaussien |
| `sensitivity` | number (0-1) | `0.5` | Seuil de confiance de détection |

## Amélioration des visages {#face-enhancement}

**Route de l'outil :** `enhance-faces`  
**Modèles :** GFPGAN, CodeFormer

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Modèle d'amélioration |
| `strength` | number (0-1) | `0.8` | Force de l'amélioration |
| `sensitivity` | number (0-1) | `0.5` | Seuil de détection de visages |
| `onlyCenterFace` | boolean | `false` | Améliorer uniquement le visage le plus central |

## Colorisation par IA {#ai-colorization}

**Route de l'outil :** `colorize`  
**Modèle :** DDColor (avec repli OpenCV DNN)

Convertit les photos en noir et blanc ou en niveaux de gris en couleur.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Force de la saturation des couleurs |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Variante du modèle |

## Suppression du bruit {#noise-removal}

**Route de l'outil :** `noise-removal`  
**Modèle :** SCUNet (pipeline de débruitage à plusieurs niveaux)

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Niveau de traitement |
| `strength` | number (0-100) | `50` | Force du débruitage |
| `detailPreservation` | number (0-100) | `50` | Quantité de détails à préserver ; une valeur plus élevée conserve plus de texture |
| `colorNoise` | number (0-100) | `30` | Force de réduction du bruit de couleur |
| `format` | string | `"original"` | Format de sortie : `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualité d'encodage de sortie |

## Suppression des yeux rouges {#red-eye-removal}

**Route de l'outil :** `red-eye-removal`

Détecte les points de repère du visage, localise les régions des yeux et corrige la sursaturation du canal rouge.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Seuil de détection des pixels rouges |
| `strength` | number (0-100) | `70` | Force de la correction |
| `format` | string | - | Remplacement du format de sortie (optionnel) |
| `quality` | number (1-100) | `90` | Qualité de sortie |

## Restauration de photos {#photo-restoration}

**Route de l'outil :** `restore-photo`

Pipeline en plusieurs étapes pour les photos anciennes ou endommagées : détection et réparation des rayures/déchirures, amélioration des visages, débruitage et colorisation optionnelle.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Détecter et réparer les rayures, les déchirures |
| `faceEnhancement` | boolean | `true` | Appliquer une passe d'amélioration des visages |
| `fidelity` | number (0-1) | `0.7` | Force de l'amélioration des visages (plus élevé = plus conservateur) |
| `denoise` | boolean | `true` | Appliquer une passe de débruitage |
| `denoiseStrength` | number (0-100) | `25` | Force du débruitage |
| `colorize` | boolean | `false` | Coloriser après la restauration |
| `colorizeStrength` | number (0-100) | `85` | Intensité de la colorisation |

## Photo d'identité {#passport-photo}

**Route de l'outil :** `passport-photo`  
**Modèles :** points de repère du visage MediaPipe + suppression d'arrière-plan BiRefNet

Flux de travail en deux phases : analyser (détecter le visage + supprimer l'arrière-plan) puis générer (recadrer, redimensionner, disposer en mosaïque). Prend en charge plus de 37 pays répartis sur 6 régions.

### Phase 1 : Analyser {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Accepte un fichier image (multipart). Renvoie les données des points de repère du visage, un aperçu en base64 et les dimensions de l'image.

### Phase 2 : Générer {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Accepte un corps JSON contenant les résultats de la Phase 1 ainsi que les paramètres de génération :

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `jobId` | string | (requis) | ID de tâche de la Phase 1 |
| `filename` | string | (requis) | Nom de fichier d'origine de la Phase 1 |
| `countryCode` | string | (requis) | Code de pays ISO (par ex., `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Type de document |
| `bgColor` | string | `"#FFFFFF"` | Couleur d'arrière-plan hexadécimale |
| `printLayout` | string | `"none"` | Disposition d'impression : `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Taille de fichier maximale en Ko (0 = aucune limite) |
| `dpi` | number (72-1200) | `300` | DPI de sortie |
| `customWidthMm` | number | - | Largeur personnalisée en mm (remplace la spécification du pays) |
| `customHeightMm` | number | - | Hauteur personnalisée en mm (remplace la spécification du pays) |
| `zoom` | number (0.5-3) | `1` | Facteur de zoom |
| `adjustX` | number | `0` | Ajustement de la position horizontale |
| `adjustY` | number | `0` | Ajustement de la position verticale |
| `landmarks` | object | (requis) | Points de repère de la Phase 1 |
| `imageWidth` | number | (requis) | Largeur de l'image de la Phase 1 |
| `imageHeight` | number | (requis) | Hauteur de l'image de la Phase 1 |

## Effacement d'objets (remplissage) {#object-erasing-inpainting}

**Route de l'outil :** `erase-object`  
**Modèle :** LaMa via ONNX Runtime

Le masque est envoyé en tant que **deuxième partie de fichier** (nom de champ `mask`), et non en base64. Les pixels blancs du masque indiquent les zones à effacer. Les paramètres `format` et `quality` sont envoyés en tant que champs de formulaire de premier niveau.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `file` | file | (requis) | Image source (multipart) |
| `mask` | file | (requis) | Image de masque (multipart, nom de champ `mask`, blanc = effacer) |
| `format` | string | `"auto"` | Format de sortie : `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualité de sortie |

Accéléré par CUDA lorsqu'un GPU NVIDIA est disponible.

## Extension de canevas par IA {#ai-canvas-expand}

**Route de l'outil :** `ai-canvas-expand`  
**Modèle :** extension basée sur LaMa

Étend le canevas d'une image dans n'importe quelle direction et remplit les nouvelles zones avec un contenu généré par IA qui correspond à l'image existante.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixels à étendre en haut |
| `extendRight` | integer | `0` | Pixels à étendre à droite |
| `extendBottom` | integer | `0` | Pixels à étendre en bas |
| `extendLeft` | integer | `0` | Pixels à étendre à gauche |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Niveau de qualité |
| `format` | string | `"auto"` | Format de sortie : `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualité de sortie |

Au moins une direction d'extension doit être supérieure à 0.

## Recadrage intelligent {#smart-crop}

**Route de l'outil :** `smart-crop`  
**Modèle :** détection de visages MediaPipe (mode visage uniquement)

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Stratégie de recadrage : `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Stratégie pour le mode sujet |
| `width` | integer | - | Largeur de sortie |
| `height` | integer | - | Hauteur de sortie |
| `padding` | integer (0-50) | `0` | Pourcentage de marge autour du sujet |
| `facePreset` | string | `"head-shoulders"` | Cadrage prédéfini lorsque `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Seuil de détection de visages |
| `threshold` | integer (0-255) | `30` | Seuil de détection de l'arrière-plan (mode rognage) |
| `padToSquare` | boolean | `false` | Compléter le résultat rogné pour obtenir un carré |
| `padColor` | string | `"#ffffff"` | Couleur d'arrière-plan pour le remplissage carré |
| `targetSize` | integer | - | Taille cible pour la sortie complétée (pixels) |
| `quality` | integer (1-100) | - | Qualité de sortie |

Les anciennes valeurs de `mode` `attention` et `content` sont acceptées et mises en correspondance avec `subject` et `trim` respectivement.

**Préréglages de visage :**

| Préréglage | Idéal pour |
|--------|---------|
| `closeup` | Portraits |
| `head-shoulders` | Photos de profil |
| `upper-body` | LinkedIn / formel |
| `half-body` | Buste complet |

## Transcrire un fichier audio {#transcribe-audio}

**Route de l'outil :** `transcribe-audio`  
**Modèle :** faster-whisper

Convertit la parole en texte. Prend en charge les formats de sortie texte brut, SRT et VTT.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Format de sortie |

## Sous-titres automatiques {#auto-subtitles}

**Route de l'outil :** `auto-subtitles`  
**Modèle :** faster-whisper (extrait l'audio de la vidéo, puis le transcrit)

Génère des fichiers de sous-titres à partir de la piste audio d'une vidéo.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Format de sous-titre de sortie |

## Correcteur de transparence PNG {#png-transparency-fixer}

**Route de l'outil :** `transparency-fixer`  
**Modèle :** détourage HR BiRefNet (résolution 2048x2048)

Corrige les PNG « faussement transparents » où l'arrière-plan a été supprimé mais a laissé un liseré, des halos ou des artefacts semi-transparents. Utilise le modèle de détourage haute résolution de BiRefNet pour produire un canal alpha propre, puis applique un traitement de suppression de liseré configurable pour éliminer la contamination des couleurs le long des bords.

**Chaîne de repli en cas de OOM :** Si le détourage HR de BiRefNet dépasse la mémoire disponible, l'outil se rabat automatiquement sur `birefnet-general`, puis sur `u2net`.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Force de suppression du liseré sur les bords pour éliminer la contamination des couleurs |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Format de l'image de sortie |
| `removeWatermark` | boolean | `false` | Appliquer un prétraitement de suppression du filigrane (filtre médian) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Outils avec des capacités d'IA optionnelles {#tools-with-optional-ai-capabilities}

Les outils suivants ne sont pas des outils du sidecar Python mais utilisent des fonctionnalités d'IA lorsque certaines options sont activées.

### Amélioration d'image {#image-enhancement}

**Route de l'outil :** `image-enhancement`  
**Moteur :** basé sur l'analyse (histogramme et statistiques Sharp)

Analyse l'image et applique des corrections automatiques pour l'exposition, le contraste, la balance des blancs, la saturation, la netteté et le bruit. Prend en charge des modes spécifiques à la scène.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Mode de scène pour ajuster les corrections |
| `intensity` | number (0-100) | `50` | Force globale de la correction |
| `corrections.exposure` | boolean | `true` | Appliquer la correction de l'exposition |
| `corrections.contrast` | boolean | `true` | Appliquer la correction du contraste |
| `corrections.whiteBalance` | boolean | `true` | Appliquer la correction de la balance des blancs |
| `corrections.saturation` | boolean | `true` | Appliquer la correction de la saturation |
| `corrections.sharpness` | boolean | `true` | Appliquer la correction de la netteté |
| `corrections.denoise` | boolean | `true` | Appliquer le débruitage |
| `deepEnhance` | boolean | `false` | Activer la suppression du bruit par IA via SCUNet (nécessite le groupe `upscale-enhance`) |

Un point de terminaison d'analyse supplémentaire est disponible à `POST /api/v1/tools/image/image-enhancement/analyze` qui renvoie les corrections détectées sans les appliquer.

### Redimensionnement contextuel (découpe de coutures) {#content-aware-resize-seam-carving}

**Route de l'outil :** `content-aware-resize`  
**Moteur :** binaire Go `caire` (pas Python : aucun bénéfice GPU)

Redimensionne intelligemment les images en supprimant les coutures à faible énergie, en préservant le contenu important.

| Paramètre | Type | Par défaut | Description |
|-----------|------|---------|-------------|
| `width` | number | - | Largeur cible |
| `height` | number | - | Hauteur cible |
| `protectFaces` | boolean | `false` | Protéger les régions de visage détectées (nécessite le groupe `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Pré-flou pour le calcul de l'énergie |
| `sobelThreshold` | number (1-20) | `2` | Seuil de sensibilité des bords |
| `square` | boolean | `false` | Forcer une sortie carrée |
