---
description: "Modifiez les champs de métadonnées EXIF, IPTC, GPS et XMP des images sans réencoder les pixels."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: 8b7e70a7ac08
---

# Modifier les métadonnées d'une image {#edit-metadata}

Modifiez les champs de métadonnées d'image, notamment EXIF, IPTC, les coordonnées GPS, les dates et les mots-clés. Utilise ExifTool en interne, de sorte que les métadonnées sont écrites sur place sans réencoder les pixels, préservant la qualité complète de l'image.

## API Endpoints {#api-endpoints}

### Modifier les métadonnées {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Écrit les champs de métadonnées dans l'image et renvoie le fichier modifié.

### Inspecter les métadonnées {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Renvoie l'ensemble des métadonnées de l'image via ExifTool au format JSON. Ne modifie pas l'image.

## Parameters (Edit) {#parameters-edit}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| title | string | Non | - | Titre de l'image (XMP/EXIF) |
| author | string | Non | - | Nom de l'auteur |
| artist | string | Non | - | Nom de l'artiste (balise EXIF Artist) |
| copyright | string | Non | - | Mention de droit d'auteur |
| imageDescription | string | Non | - | Description de l'image (EXIF) |
| software | string | Non | - | Balise logiciel |
| dateTime | string | Non | - | Valeur EXIF DateTime |
| dateTimeOriginal | string | Non | - | Valeur EXIF DateTimeOriginal |
| setAllDates | string | Non | - | Définir tous les champs de date à la fois |
| dateShift | string | Non | - | Décaler toutes les dates d'un offset (format : `+HH:MM` ou `-HH:MM`) |
| clearGps | boolean | Non | `false` | Supprimer toutes les données GPS |
| gpsLatitude | number | Non | - | Définir la latitude GPS (-90 à 90) |
| gpsLongitude | number | Non | - | Définir la longitude GPS (-180 à 180) |
| gpsAltitude | number | Non | - | Définir l'altitude GPS en mètres |
| keywords | string[] | Non | - | Mots-clés/tags à ajouter ou à définir |
| keywordsMode | string | Non | `"add"` | Comment gérer les mots-clés : `add` (ajouter) ou `set` (remplacer) |
| fieldsToRemove | string[] | Non | `[]` | Liste des noms de champs de métadonnées spécifiques à supprimer |
| iptcTitle | string | Non | - | IPTC Object Name |
| iptcHeadline | string | Non | - | IPTC Headline |
| iptcCity | string | Non | - | IPTC City |
| iptcState | string | Non | - | IPTC Province/State |
| iptcCountry | string | Non | - | IPTC Country |

## Example Request {#example-request}

Définir l'auteur et le droit d'auteur :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Définir les coordonnées GPS :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Supprimer le GPS et ajouter des mots-clés :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspecter les métadonnées :

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

- Cet outil nécessite l'installation d'ExifTool sur le serveur. Il est inclus dans l'image Docker.
- Les métadonnées sont écrites sur place, donc aucun réencodage des pixels n'a lieu. La variation de la taille du fichier est minime (juste les octets de métadonnées).
- Le paramètre `dateShift` décale tous les champs de date de l'offset spécifié, utile pour corriger les erreurs de fuseau horaire (par ex. `+02:00` ou `-05:30`).
- Si aucune modification n'est demandée (tous les paramètres omis ou vides), le fichier d'origine est renvoyé inchangé.
- Formats pris en charge : JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Pour les formats non prévisualisables dans le navigateur (HEIF, TIFF), la réponse inclut un champ `previewUrl` avec un aperçu WebP.
