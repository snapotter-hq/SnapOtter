---
description: "Générateur de photos d'identité et de passeport assisté par IA avec détection des visages, suppression de l'arrière-plan et disposition en planche d'impression."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: d2f355d715f7
---

# Photo de passeport {#passport-photo}

Générateur de photos d'identité et de passeport assisté par IA. Flux en deux phases : analyse (détection des visages + suppression de l'arrière-plan) puis génération (recadrage, redimensionnement et disposition en planche pour l'impression).

## Points de terminaison API {#api-endpoints}

Cet outil utilise un flux en deux phases avec des points de terminaison distincts pour l'analyse et la génération.

**Ensembles de modèles :** `background-removal` et `face-detection`

---

### Phase 1 : Analyse {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Détecte les points caractéristiques du visage et supprime l'arrière-plan. Renvoie les données des points caractéristiques et un aperçu pour que le frontend affiche un aperçu de recadrage.

#### Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| clientJobId | string | Non | - | ID de tâche facultatif pour le suivi de la progression via SSE |

#### Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Réponse (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progression (SSE, facultatif) {#progress-sse-optional}

Si `clientJobId` est fourni, la progression est diffusée (0-30 % pour la détection du visage, 30-95 % pour la suppression de l'arrière-plan).

#### Erreur : aucun visage détecté (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2 : Génération {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Recadre, redimensionne et dispose éventuellement la photo sur une planche d'impression. Utilise les images mises en cache de la phase 1 (pas de nouvelle exécution de l'IA).

#### Paramètres (corps JSON) {#parameters-json-body}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Oui | - | ID de tâche issu de la phase 1 |
| filename | string | Oui | - | Nom de fichier d'origine issu de la phase 1 |
| countryCode | string | Oui | - | Code pays pour les spécifications de passeport (par exemple `US`, `GB`, `IN`) |
| documentType | string | Non | `"passport"` | Type de document (selon les spécifications du pays) |
| bgColor | string | Non | `"#FFFFFF"` | Couleur d'arrière-plan en hexadécimal |
| printLayout | string | Non | `"none"` | Disposition du papier d'impression : `none`, `4x6`, `a4` |
| maxFileSizeKb | number | Non | `0` | Contrainte de taille de fichier maximale en Ko (0 = aucune limite) |
| dpi | number | Non | `300` | DPI de sortie (72-1200) |
| customWidthMm | number | Non | - | Largeur personnalisée de la photo en mm (remplace les spécifications du pays) |
| customHeightMm | number | Non | - | Hauteur personnalisée de la photo en mm (remplace les spécifications du pays) |
| zoom | number | Non | `1` | Facteur de zoom (0.5-3). Les valeurs > 1 recadrent plus serré |
| adjustX | number | Non | `0` | Ajustement de la position horizontale |
| adjustY | number | Non | `0` | Ajustement de la position verticale |
| landmarks | object | Oui | - | Objet de points caractéristiques issu de la réponse de la phase 1 |
| imageWidth | number | Oui | - | Largeur de l'image issue de la réponse de la phase 1 |
| imageHeight | number | Oui | - | Hauteur de l'image issue de la réponse de la phase 1 |

#### Exemple de requête {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Réponse (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Route de base {#base-route}

`POST /api/v1/tools/image/passport-photo`

Renvoie des indications pour utiliser le sous-point de terminaison approprié.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Remarques {#notes}

- Nécessite l'installation des ensembles de modèles `background-removal` et `face-detection`.
- La phase 1 exécute l'IA (points caractéristiques du visage + suppression de l'arrière-plan) et met en cache les résultats. La phase 2 est une pure manipulation d'image avec Sharp (rapide, sans IA).
- Les points caractéristiques sont renvoyés sous forme de coordonnées normalisées (plage 0-1 relative aux dimensions de l'image).
- Le champ `preview` dans la réponse d'analyse est un PNG encodé en base64 (largeur maximale 800 px) pour un affichage rapide.
- Les spécifications par pays incluent les dimensions du document, les ratios de hauteur de la tête et le positionnement de la ligne des yeux selon les exigences officielles des photos de passeport.
- L'option `printLayout` génère une planche disposée sur du papier 4x6\" ou A4 avec des gouttières de 2 mm entre les photos.
- Lorsque `maxFileSizeKb` est défini, la sortie est compressée de façon itérative pour respecter la limite de taille.
