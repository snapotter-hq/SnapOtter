---
description: "Extrayez le texte des images localement avec Tesseract intégré ou le runtime RapidOCR haute précision en option."
i18n_output_hash: 526588702ae3
i18n_source_hash: 0d453b49db02
i18n_provenance: human
---

# OCR / Extraction de texte {#ocr-text-extraction}

Extrayez le texte des images sans envoyer l'image à un service externe. Le niveau `fast` intégré utilise Tesseract. Les niveaux optionnels `balanced` et `best` utilisent RapidOCR avec les modèles PP-OCR ONNX épinglés.


<!-- korean-ocr-contract:start -->
::: info Compatibilité de l’OCR coréen
L’OCR rapide prend en charge `auto`, `en`, `de`, `es`, `fr`, `zh` et `ja`, mais pas le coréen (`ko`). Le coréen nécessite le pack OCR précis et `balanced` ou `best`. Le pack fonctionne dans les conteneurs Linux amd64 et arm64 officiels, y compris sur les hôtes NVIDIA où l’OCR reste exécuté sur le CPU. Un système non pris en charge reçoit une erreur de compatibilité explicite, sans repli silencieux vers `fast`. Le coréen avec `fast` ou l’alias historique `tesseract` est refusé avant la mise en file avec `FEATURE_INCOMPATIBLE` et `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Traitement :** L’OCR est toujours asynchrone. Après validation et mise en file d’attente, le point de terminaison renvoie immédiatement `202 Accepted` avec un `jobId`. Suivez le flux de progression SSE de la tâche jusqu’à son événement final `complete` ou `failed` ; le `result` d’un événement réussi contient les champs OCR.

**Pack OCR précis :** Runtime `ocr` en option (environ 208-234 MiB à télécharger et 409-488 MiB installés, selon la cible). `fast` ne nécessite pas ce pack ; le programme d'installation vérifie les tailles exactes liées par l'index signé.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (en plusieurs parties), jusqu'à 512 MiB encodés et 40 mégapixels décodés ; une limite inférieure de téléchargement par l'opérateur s'applique toujours |
| quality | string | Non | Dynamique | Niveau de qualité : `fast` (Tesseract), `balanced` (RapidOCR avec les petits modèles PP-OCRv6) ou `best` (les modèles PP-OCRv6 moyens de plus haute précision avec une variante de notation calibrée) |
| language | string | Non | `"auto"` | Indication de langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Non | Dépend du niveau | Améliorer le contraste local avant la reconnaissance. Fast l'applique directement ; Equilibré et Meilleur conservent la variante uniquement lorsque la notation calibrée améliore le résultat. La valeur par défaut est `true` pour `best` et `false` pour `fast`/`balanced` |
| engine | string | Non | - | Alias ​​de compatibilité obsolète. Utilisez plutôt `quality`. `tesseract` correspond à `fast` ; la valeur `paddleocr` héritée est mappée à `balanced` mais ne charge pas PaddlePaddle |

Lorsque `quality` et `engine` sont omis, SnapOtter choisit le meilleur niveau disponible dans cet ordre : `best`, `balanced`, `fast`. Pour le coréen, `fast` n’est jamais choisi : `best`, puis `balanced` sont utilisés, sinon une erreur d’installation ou de compatibilité du moteur précis est renvoyée.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Réponse acceptée (202) {#accepted-response-202}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progression et résultat (SSE) {#progress-sse-optional}

Connectez-vous à `GET /api/v1/jobs/{jobId}/progress` avec le `jobId` renvoyé par la réponse `202` (ou le `clientJobId` fourni). Gardez le flux ouvert jusqu’à l’événement final `complete` ou `failed`. Une trame finale réussie contient la sortie OCR dans `result` :

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "type": "single",
  "phase": "complete",
  "stage": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_ocr.txt",
    "originalSize": 12345,
    "processedSize": 47,
    "text": "Extracted text content from the image...",
    "engine": "rapidocr-onnx",
    "requestedQuality": "best",
    "actualQuality": "best",
    "device": "cpu",
    "provider": "CPUExecutionProvider",
    "degraded": false,
    "warnings": [],
    "runtimeVersion": "2.1.0",
    "modelVersion": "PP-OCRv6-best-v1-medium"
  }
}
```

Les échecs de traitement arrivent dans le champ `error` de l’événement final `failed` ; ils ne sont pas renvoyés sous forme de réponse HTTP `422` après la mise en file d’attente.

## Remarques {#notes}

- `fast` est toujours disponible dans les images SnapOtter prises en charge. `balanced` et `best` nécessitent le pack OCR précis en option.
- Tesseract intégré ajoute environ 25 MiB à l'image officielle. Le pack précis est stocké dans `/data/ai`, et non intégré à l'image.
- Le pack précis est publié pour les conteneurs officiels Linux amd64 et arm64. Il utilise délibérément le fournisseur CPU de ONNX Runtime, y compris sur les hôtes NVIDIA, il ne dépend donc pas des bibliothèques CUDA ou de la compatibilité GPU. Les installations bare-metal sources et prédéfinies utilisent Fast OCR à moins qu'elles ne fournissent leur propre environnement d'exécution compatible.
- Le `result` final réussi contient à la fois le texte extrait dans `text` et un artefact `.txt` téléchargeable dans `downloadUrl`.
- SnapOtter honore un niveau explicitement demandé. Si `balanced` ou `best` n'est pas disponible, API renvoie `501` avec `FEATURE_NOT_INSTALLED` ou `FEATURE_INCOMPATIBLE` ; il ne rétrograde jamais silencieusement la demande à un autre niveau.
- Un résultat vide réussi reste un résultat vide. Les échecs d'exécution renvoient une erreur au lieu de réessayer avec un moteur de qualité inférieure.
- Le `result` final réussi signale à la fois `requestedQuality` et `actualQuality`, ainsi que les versions du moteur, de l'appareil, du fournisseur, de l'exécution et du modèle, ainsi que tous les avertissements.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
- Les entrées codées surdimensionnées renvoient `413`. Les images de plus de 40 mégapixels et les réponses OCR dépassant leurs limites de sortie sont rejetées au lieu d'être partiellement traitées.
