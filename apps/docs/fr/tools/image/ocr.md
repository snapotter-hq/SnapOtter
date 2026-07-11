---
description: "Extrayez le texte des images grâce à la reconnaissance optique de caractères assistée par IA."
i18n_source_hash: 3d85d423b82c
i18n_provenance: human
i18n_output_hash: a396b001a113
---

# OCR / Extraction de texte {#ocr-text-extraction}

Extrayez le texte des images grâce à la reconnaissance optique de caractères assistée par IA. Prend en charge plusieurs langues et niveaux de qualité.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/ocr`

**Traitement :** réponse JSON synchrone. Si `clientJobId` est fourni, la progression est également signalée via SSE.

**Ensemble de modèles :** `ocr` (5-6 Go)

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier image (multipart) |
| quality | string | Non | `"balanced"` | Niveau de qualité : `fast` (Tesseract), `balanced` (PaddleOCR v5), `best` (PaddleOCR VL) |
| language | string | Non | `"auto"` | Indication de langue : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| enhance | boolean | Non | `true` | Prétraite l'image pour améliorer la précision de l'OCR |
| engine | string | Non | - | Déprécié. Utilisez `quality` à la place. Fait correspondre `tesseract` à `fast`, `paddleocr` à `balanced` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ocr \
  -F "file=@document.png" \
  -F 'settings={"quality":"best","language":"en","enhance":true}'
```

## Réponse (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "document.png",
  "text": "Extracted text content from the image...",
  "engine": "paddleocr-vl"
}
```

### Progression (SSE, facultatif) {#progress-sse-optional}

Si un champ de formulaire `clientJobId` est fourni, des événements de progression sont diffusés :

```
event: progress
data: {"phase":"processing","stage":"Recognizing text...","percent":50}
```

## Remarques {#notes}

- Nécessite l'installation de l'ensemble de modèles `ocr` (5-6 Go).
- L'OCR renvoie directement le texte extrait plutôt qu'une URL de téléchargement d'image.
- Utilise une chaîne de repli : si un niveau de qualité supérieur plante (par exemple un segfault de PaddleOCR), il réessaie automatiquement avec le niveau inférieur suivant.
- Si un niveau renvoie un texte vide sans planter, il bascule également vers le niveau suivant.
- Les niveaux de qualité correspondent à des moteurs : `fast` = Tesseract, `balanced` = PaddleOCR v5, `best` = PaddleOCR VL.
- Prend en charge les formats d'entrée HEIC/HEIF, RAW, TGA, PSD, EXR et HDR via un décodage automatique.
