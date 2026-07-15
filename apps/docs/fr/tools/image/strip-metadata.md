---
description: "Supprime les métadonnées EXIF, GPS, ICC et XMP des images pour préserver la confidentialité et réduire la taille des fichiers."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 1c6931be00aa
---

# Supprimer les métadonnées d'une image {#remove-metadata}

Supprime les métadonnées EXIF, GPS, les profils colorimétriques ICC et les métadonnées XMP des images. Utile pour la confidentialité (suppression des coordonnées GPS, des informations d'appareil photo) et pour réduire la taille des fichiers.

## Points d'accès de l'API {#api-endpoints}

### Supprimer les métadonnées {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Traite l'image et renvoie une version nettoyée dont les métadonnées sélectionnées ont été supprimées.

### Inspecter les métadonnées {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Renvoie les métadonnées analysées au format JSON sans modifier l'image. Utile pour prévisualiser les métadonnées existantes avant leur suppression.

## Paramètres (Suppression) {#parameters-strip}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Non | `false` | Supprime les données EXIF (réglages de l'appareil photo, dates, etc.) |
| stripGps | boolean | Non | `false` | Supprime uniquement les données GPS/de localisation |
| stripIcc | boolean | Non | `false` | Supprime le profil colorimétrique ICC |
| stripXmp | boolean | Non | `false` | Supprime les métadonnées XMP (Adobe, IPTC) |
| stripAll | boolean | Non | `true` | Supprime toutes les métadonnées en une seule fois |

Lorsque `stripAll` vaut `true`, il prend le pas sur les indicateurs individuels et supprime tout.

## Exemple de requête {#example-request}

Supprimer toutes les métadonnées :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Supprimer uniquement les données GPS (conserver les informations d'appareil photo et le profil colorimétrique) :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Inspecter les métadonnées sans modification :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exemple de réponse (Suppression) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Exemple de réponse (Inspection) {#example-response-inspect}

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

## Remarques {#notes}

- L'image est réencodée dans son format d'origine après la suppression. JPEG utilise mozjpeg à la qualité 90, PNG utilise le niveau de compression 9, WebP utilise la qualité 85.
- La suppression des profils ICC peut provoquer de légers décalages de couleur si l'image était étiquetée avec un profil non-sRGB. Utilisez `stripIcc: false` si la précision des couleurs est importante.
- Le point d'accès d'inspection convertit les coordonnées GPS en valeurs décimales de latitude/longitude (préfixées d'un tiret bas) pour plus de commodité.
- Formats d'entrée pris en charge : JPEG, PNG, WebP, AVIF, TIFF, GIF.
