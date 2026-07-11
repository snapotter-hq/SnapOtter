---
description: "Générez toutes les tailles standard de favicon et d'icônes d'application à partir d'une image source."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 078b8dc93c22
---

# Générateur de favicon {#favicon-generator}

Générez un ensemble complet de fichiers de favicon et d'icônes d'application à partir d'une image source. Produit toutes les tailles standard nécessaires pour les navigateurs, les appareils Apple et Android, accompagnées d'un manifeste web et d'un extrait HTML.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Accepte des données de formulaire multipart avec une ou plusieurs images et un champ JSON `settings` facultatif.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| background | string | Non | - | Couleur de fond hexadécimale (par exemple `"#ffffff"`). Lorsqu'elle est définie, l'icône est aplatie sur cette couleur. |
| padding | integer | Non | `0` | Pourcentage de marge autour du contenu de l'icône (0 à 40) |
| radius | integer | Non | `0` | Pourcentage de rayon des coins pour les icônes arrondies (0 à 50) |
| sizes | integer[] | Non | - | Restreint la sortie à des tailles en pixels spécifiques (par exemple `[16, 32, 180]`). Omettez pour générer toutes les tailles standard. |
| themeColor | string | Non | `"#ffffff"` | Couleur de thème hexadécimale pour le manifeste web |

## Fichiers générés {#generated-files}

Pour chaque image d'entrée, les fichiers suivants sont produits :

| Fichier | Taille | Rôle |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Icône d'onglet de navigateur |
| `favicon-32x32.png` | 32x32 | Icône d'onglet de navigateur (HiDPI) |
| `favicon-48x48.png` | 48x48 | Raccourci du bureau |
| `apple-touch-icon.png` | 180x180 | Écran d'accueil iOS |
| `android-chrome-192x192.png` | 192x192 | Écran d'accueil Android |
| `android-chrome-512x512.png` | 512x512 | Écran de démarrage Android |
| `favicon.ico` | 32x32 | Format ICO hérité |
| `manifest.json` | - | Manifeste d'application web avec références d'icônes |
| `favicon-snippet.html` | - | Balises de lien HTML prêtes à l'emploi |

## Exemple de requête {#example-request}

Image source unique avec coins arrondis et marge :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Plusieurs images sources (chacune obtient son propre ensemble dans un sous-dossier) :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Exemple de réponse {#example-response}

La réponse est un fichier ZIP diffusé directement. Les en-têtes de réponse sont :

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Extrait HTML inclus {#html-snippet-included}

Le ZIP inclut un fichier `favicon-snippet.html` que vous pouvez coller dans la section `<head>` de votre HTML :

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Notes {#notes}

- Les images sources sont redimensionnées avec le mode d'ajustement `cover`, ce qui signifie qu'elles sont recadrées pour remplir chaque taille carrée. Pour de meilleurs résultats, utilisez une image source carrée.
- Lorsque plusieurs fichiers sont téléversés, chacun obtient son propre sous-dossier dans le ZIP (nommé d'après le fichier source).
- Pour le téléversement d'un seul fichier, toutes les sorties se trouvent à la racine du ZIP sans sous-dossier.
- Les fichiers qui échouent à la validation ou au décodage sont ignorés, et un `skipped-files.txt` est inclus dans le ZIP pour expliquer les problèmes.
- Formats d'entrée pris en charge : JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD, et plus.
- L'orientation EXIF est appliquée automatiquement avant le redimensionnement.
