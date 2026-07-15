---
description: "Convertissez les images entre formats, y compris les formats modernes comme AVIF, JXL et HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: c2f8ce1ebb6a
---

# Convertir une image {#convert}

Convertissez les images entre formats. Prend en charge les formats web courants ainsi que les formats spécialisés comme HEIC, JXL, BMP, ICO, JP2, QOI et PSD.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/convert`

Accepte des données de formulaire multipart avec un fichier image et un champ JSON `settings`.

## Parameters {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| format | string | Oui | - | Format cible : `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Non | - | Qualité de sortie (1-100). S'applique aux formats avec perte comme jpg, webp, avif, heic. |

## Supported Output Formats {#supported-output-formats}

| Format | Type | Remarques |
|--------|------|-------|
| jpg | Avec perte | JPEG, meilleure compatibilité |
| png | Sans perte | Prend en charge la transparence |
| webp | Les deux | Format web moderne, bonne compression |
| avif | Avec perte | Format nouvelle génération, excellente compression |
| tiff | Les deux | Flux de travail impression/édition |
| gif | Sans perte | Limité à 256 couleurs |
| heic / heif | Avec perte | Format de l'écosystème Apple |
| jxl | Les deux | JPEG XL, format nouvelle génération |
| bmp | Sans perte | Bitmap non compressé |
| ico | Sans perte | Format d'icône Windows |
| jp2 | Avec perte | JPEG 2000 |
| qoi | Sans perte | Format Quite OK Image |
| psd | En calques | Adobe Photoshop (nécessite ImageMagick) |
| ppm | Sans perte | Portable Pixmap (PPM/PGM/PBM) |
| eps | Vectoriel | Encapsulated PostScript |
| tga | Sans perte | Format d'image Targa |

## Example Request {#example-request}

Convertir en WebP :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Convertir en PNG (sans perte) :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Notes {#notes}

- L'extension du nom de fichier de sortie est automatiquement mise à jour pour correspondre au format cible.
- Les entrées SVG sont rastérisées à 300 DPI avant la conversion.
- La conversion PSD nécessite l'installation d'ImageMagick sur le serveur.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI et TGA utilisent des encodeurs CLI spécialisés et contournent le traitement Sharp.
- L'encodage HEIC/HEIF utilise la bibliothèque d'encodage HEIC du système.
- Les formats d'entrée sont larges : JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW, etc.), PSD, SVG, BMP et plus encore.
