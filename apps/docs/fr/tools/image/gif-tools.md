---
description: "Redimensionnez, optimisez, changez la vitesse, inversez, faites pivoter et extrayez des images de GIF animés dans un seul outil."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: c8004453c737
---

# Outils GIF {#gif-tools}

Redimensionnez, optimisez, changez la vitesse, inversez, extrayez des images et faites pivoter des GIF animés. Fournit plusieurs modes d'opération dans un seul outil.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Paramètres {#parameters}

### Paramètres communs {#common-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Non | `"resize"` | Mode d'opération : `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | Non | 0 | Nombre de boucles pour le GIF de sortie (0 = infini, 1-100 = boucles finies) |

### Paramètres du mode Redimensionner {#resize-mode-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Non | - | Largeur cible en pixels (1 à 16384) |
| height | integer | Non | - | Hauteur cible en pixels (1 à 16384) |
| percentage | number | Non | - | Mise à l'échelle par pourcentage (1 à 500). Remplace width/height si défini. |

### Paramètres du mode Optimiser {#optimize-mode-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| colors | number | Non | 256 | Nombre maximal de couleurs dans la palette (2 à 256) |
| dither | number | Non | 1.0 | Intensité du tramage (0 à 1, où 0 désactive le tramage) |
| effort | number | Non | 7 | Niveau d'effort d'optimisation (1 à 10, plus élevé = plus lent mais plus petit) |

### Paramètres du mode Vitesse {#speed-mode-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| speedFactor | number | Non | 1.0 | Multiplicateur de vitesse (0.1 à 10). Les valeurs > 1 accélèrent, < 1 ralentissent. |

### Paramètres du mode Extraire {#extract-mode-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| extractMode | string | Non | `"single"` | Mode d'extraction : `single`, `range`, `all` |
| frameNumber | number | Non | 0 | Index de l'image à extraire en mode `single` (base 0) |
| frameStart | number | Non | 0 | Index de l'image de début pour le mode `range` (base 0) |
| frameEnd | number | Non | - | Index de l'image de fin pour le mode `range` (base 0, inclus) |
| extractFormat | string | Non | `"png"` | Format des images extraites : `png`, `webp` |

### Paramètres du mode Pivoter {#rotate-mode-parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| angle | number | Non | - | Angle de rotation : `90`, `180`, ou `270` degrés |
| flipH | boolean | Non | `false` | Retourner horizontalement |
| flipV | boolean | Non | `false` | Retourner verticalement |

## Exemples de requêtes {#example-requests}

### Redimensionner {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimiser {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Accélérer {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extraire une seule image {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Sous-route Info {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Renvoie les métadonnées d'un GIF animé sans le traiter.

### Requête Info {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Réponse Info {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notes {#notes}

- Utilise la factory `createToolRoute` standard pour le point de terminaison de traitement principal.
- Le point de terminaison Info ne nécessite qu'un téléversement de fichier (aucun réglage requis).
- En mode `resize`, si `percentage` est fourni, il est prioritaire sur `width`/`height`. Le redimensionnement utilise `fit: inside` pour conserver le rapport d'aspect.
- En mode `speed`, les délais des images sont divisés par le facteur de vitesse. Le délai minimal par image est de 20 ms (limitation de la spécification GIF).
- En mode `reverse`, le paramètre `speedFactor` est également disponible pour ajuster simultanément la vitesse pendant l'inversion.
- En mode `extract` avec `range` ou `all`, la sortie est un fichier ZIP contenant les images individuelles.
- En mode `rotate`, chaque image est traitée individuellement puis réassemblée en une animation.
- Le paramètre `loop` contrôle le nombre de fois où le GIF de sortie boucle. Utilisez 0 pour une boucle infinie.
- Le champ `duration` de la réponse Info est la durée totale de l'animation en millisecondes.
