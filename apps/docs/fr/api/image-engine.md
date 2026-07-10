---
description: "Référence des opérations du moteur d'image. Toutes les opérations de traitement d'image basées sur Sharp et leurs paramètres."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 0aafaaa6273a
---

# Moteur d'image {#image-engine}

Le paquet `@snapotter/image-engine` gère toutes les opérations d'image non liées à l'IA. Il encapsule [Sharp](https://sharp.pixelplumbing.com/) et s'exécute entièrement en cours de processus sans dépendances externes.

## Opérations {#operations}

### resize {#resize}

Met une image à l'échelle à des dimensions précises ou par pourcentage.

| Paramètre | Type | Description |
|---|---|---|
| `width` | number | Largeur cible en pixels |
| `height` | number | Hauteur cible en pixels |
| `fit` | string | `cover`, `contain`, `fill`, `inside`, ou `outside` |
| `withoutEnlargement` | boolean | Si vrai, n'agrandit pas les images plus petites |
| `percentage` | number | Mettre à l'échelle par pourcentage au lieu de dimensions absolues |

Vous pouvez définir `width`, `height`, ou les deux. Si vous n'en définissez qu'un seul, l'autre est calculé pour conserver le rapport hauteur/largeur.

### crop {#crop}

Découpe une région rectangulaire de l'image.

| Paramètre | Type | Description |
|---|---|---|
| `left` | number | Décalage X depuis le bord gauche |
| `top` | number | Décalage Y depuis le bord supérieur |
| `width` | number | Largeur de la zone de recadrage |
| `height` | number | Hauteur de la zone de recadrage |
| `unit` | string | `px` (par défaut) ou `percent` |

### rotate {#rotate}

Fait pivoter l'image d'un angle donné.

| Paramètre | Type | Description |
|---|---|---|
| `angle` | number | Angle de rotation en degrés (0-360) |
| `background` | string | Couleur de remplissage pour la zone exposée (par défaut : `#000000`). Ne s'applique qu'aux angles non multiples de 90 degrés. |

### flip {#flip}

Met l'image en miroir horizontalement, verticalement, ou les deux. Au moins un des deux doit être vrai.

| Paramètre | Type | Description |
|---|---|---|
| `horizontal` | boolean | Miroir de gauche à droite |
| `vertical` | boolean | Miroir de haut en bas |

### convert {#convert}

Change le format de l'image.

| Paramètre | Type | Description |
|---|---|---|
| `format` | string | Format cible : `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `jxl`, `heic`, `heif`, `bmp`, `ico`, `jp2`, `qoi` |
| `quality` | number | Qualité de compression (1-100, s'applique aux formats avec perte) |

Les sept premiers formats (de `jpg` à `jxl`) sont encodés par Sharp en cours de processus. Les formats restants utilisent des encodeurs externes au niveau de l'API : `heic`/`heif` via heif-enc, `bmp`/`ico` via ImageMagick, `jp2` via opj_compress, et `qoi` via un codec TypeScript intégré.

### compress {#compress}

Réduit la taille du fichier tout en conservant le même format.

| Paramètre | Type | Description |
|---|---|---|
| `quality` | number | Qualité cible (1-100) |
| `targetSizeBytes` | number | Taille de fichier cible optionnelle en octets |
| `format` | string | Remplacement de format optionnel |

### strip-metadata {#strip-metadata}

Supprime les métadonnées EXIF, IPTC, XMP et ICC de l'image. Sans paramètres (ou `stripAll: true`), supprime tout. Passez des indicateurs individuels pour une suppression sélective.

| Paramètre | Type | Description |
|---|---|---|
| `stripAll` | boolean | Supprimer toutes les métadonnées (par défaut lorsqu'aucun indicateur n'est défini) |
| `stripExif` | boolean | Supprimer les données EXIF (y compris le GPS si `stripGps` n'est pas défini séparément) |
| `stripGps` | boolean | Supprimer les données de localisation GPS |
| `stripIcc` | boolean | Supprimer le profil de couleur ICC |
| `stripXmp` | boolean | Supprimer les métadonnées XMP |

### Ajustements de couleur {#color-adjustments}

Ces opérations modifient les propriétés de couleur d'une image. Chacune prend une seule valeur numérique.

| Opération | Paramètre | Plage | Description |
|---|---|---|---|
| `brightness` | `value` | -100 à 100 | Ajuster la luminosité |
| `contrast` | `value` | -100 à 100 | Ajuster le contraste |
| `saturation` | `value` | -100 à 100 | Ajuster la saturation des couleurs |

### Filtres de couleur {#color-filters}

Ceux-ci appliquent une transformation de couleur fixe. Ils ne prennent aucun paramètre.

| Opération | Description |
|---|---|
| `grayscale` | Convertir en niveaux de gris |
| `sepia` | Appliquer une teinte sépia |
| `invert` | Inverser toutes les couleurs |

### Canaux de couleur {#color-channels}

Ajuste les canaux de couleur RVB individuels. Les valeurs sont des multiplicateurs où 100 = aucun changement.

| Paramètre | Type | Description |
|---|---|---|
| `red` | number | Multiplicateur du canal rouge (0 à 200, 100 = inchangé) |
| `green` | number | Multiplicateur du canal vert (0 à 200, 100 = inchangé) |
| `blue` | number | Multiplicateur du canal bleu (0 à 200, 100 = inchangé) |

### sharpen {#sharpen}

Accentuation simple contrôlée par une seule valeur.

| Paramètre | Type | Description |
|---|---|---|
| `value` | number | Intensité de l'accentuation (0 à 100). Associée à un sigma gaussien de 0,5-10. |

### sharpen-advanced {#sharpen-advanced}

Accentuation avancée avec trois méthodes sélectionnables et une pré-passe optionnelle de réduction du bruit.

| Paramètre | Type | Description |
|---|---|---|
| `method` | string | `adaptive`, `unsharp-mask`, ou `high-pass` |
| `sigma` | number | Rayon du flou gaussien, 0,5-10 (adaptatif) |
| `m1` | number | Accentuation des zones planes, 0-10 (adaptatif) |
| `m2` | number | Accentuation des zones texturées, 0-20 (adaptatif) |
| `x1` | number | Seuil plat/dentelé, 0-10 (adaptatif) |
| `y2` | number | Éclaircissement maximal (limite de halo), 0-50 (adaptatif) |
| `y3` | number | Assombrissement maximal (limite de halo), 0-50 (adaptatif) |
| `amount` | number | Pourcentage d'intensité, 0-500 (masque flou) |
| `radius` | number | Rayon du flou, 0,1-5,0 (masque flou) |
| `threshold` | number | Luminosité minimale des contours, 0-255 (masque flou) |
| `strength` | number | Intensité du mélange, 0-100 (passe-haut) |
| `kernelSize` | number | `3` ou `5` pour un noyau 3x3 / 5x5 (passe-haut) |
| `denoise` | string | Pré-passe de réduction du bruit : `off`, `light`, `medium`, ou `strong` |

Les paramètres sont propres à chaque méthode. Ne fournissez que ceux pertinents pour la méthode choisie.

### color-blindness {#color-blindness}

Simule une déficience de la vision des couleurs à l'aide d'une matrice de recombinaison des couleurs 3x3.

| Paramètre | Type | Description |
|---|---|---|
| `type` | string | L'une de : `protanopia`, `deuteranopia`, `tritanopia`, `protanomaly`, `deuteranomaly`, `tritanomaly`, `achromatopsia`, `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

Écrit ou supprime des champs de métadonnées EXIF/IPTC individuels sans supprimer le bloc entier.

| Paramètre | Type | Description |
|---|---|---|
| `artist` | string | Balise EXIF Artist |
| `copyright` | string | Balise EXIF Copyright |
| `imageDescription` | string | Balise EXIF ImageDescription |
| `software` | string | Balise EXIF Software |
| `dateTime` | string | Balise EXIF DateTime |
| `dateTimeOriginal` | string | Balise EXIF DateTimeOriginal |
| `clearGps` | boolean | Supprimer toutes les balises GPS |
| `fieldsToRemove` | string[] | Liste des noms de champs EXIF à supprimer |

Tous les paramètres sont optionnels. Les champs listés dans `fieldsToRemove` sont supprimés du bloc EXIF existant. Les champs définis via les paramètres nommés sont écrits (ou écrasés). Les clés binaires/dangereuses comme MakerNote sont ignorées silencieusement.

## Détection de format {#format-detection}

Le moteur détecte automatiquement les formats d'entrée à partir des en-têtes de fichier, et non simplement des extensions de fichier. Cela signifie qu'un fichier `.jpg` qui est en réalité un PNG sera traité correctement. La détection utilise une approche multicouche : d'abord les octets magiques, puis l'extension de fichier en repli.

SnapOtter prend en charge **plus de 55 formats d'entrée** et **13 formats de sortie**, dont 23 formats RAW d'appareils photo de plus de 20 marques, des formats professionnels (PSD, EPS, OpenEXR, HDR), des codecs modernes (JPEG XL, AVIF, HEIC, QOI, JPEG 2000) et des formats scientifiques/de jeu (FITS, DDS). Le décodage est géré nativement par Sharp lorsque c'est possible, avec repli automatique sur ImageMagick, LibRaw et des décodeurs CLI spécialisés.

Consultez la page [Formats pris en charge](/fr/guide/supported-formats) pour la liste complète.

## Extraction des métadonnées {#metadata-extraction}

L'outil `info` renvoie les métadonnées de l'image. Consultez [Informations sur l'image](/fr/tools/image/info) pour la référence complète des champs.

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
