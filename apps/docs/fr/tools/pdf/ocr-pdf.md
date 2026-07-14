---
description: "Extrayez localement le texte des PDF numérisés avec Tesseract intégré ou le runtime RapidOCR haute précision en option."
i18n_output_hash: f66b6b57bee4
i18n_source_hash: a19ba25a1ca8
i18n_provenance: human
---

# OCR de PDF {#pdf-ocr}

Extrayez le texte des documents PDF numérisés page par page sans envoyer le PDF à un service externe. Le niveau `fast` intégré utilise Tesseract. Les niveaux optionnels `balanced` et `best` utilisent RapidOCR avec les modèles PP-OCR ONNX épinglés.


<!-- korean-ocr-contract:start -->
::: info Compatibilité de l’OCR coréen
L’OCR rapide prend en charge `auto`, `en`, `de`, `es`, `fr`, `zh` et `ja`, mais pas le coréen (`ko`). Le coréen nécessite le pack OCR précis et `balanced` ou `best`. Le pack fonctionne dans les conteneurs Linux amd64 et arm64 officiels, y compris sur les hôtes NVIDIA où l’OCR reste exécuté sur le CPU. Un système non pris en charge reçoit une erreur de compatibilité explicite, sans repli silencieux vers `fast`. Le coréen avec `fast` ou l’alias historique `tesseract` est refusé avant la mise en file avec `FEATURE_INCOMPATIBLE` et `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accepte des données de formulaire multipart avec un fichier PDF et un champ `settings` facultatif au format JSON.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| file | file | Oui | - | Fichier PDF (en plusieurs parties), jusqu'à 512 MiB codés ; une limite inférieure de téléchargement par l'opérateur s'applique toujours |
| quality | string | Non | Dynamique | Niveau de qualité OCR : `fast`, `balanced` ou `best` |
| language | string | Non | `"auto"` | Langue du document : `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | Non | `"all"` | Sélection de pages, par exemple `"all"`, `"1-3"`, `"1,3,5"` |
| enhance | boolean | Non | Dépend du niveau | Améliorer le contraste local avant la reconnaissance. Fast l'applique directement ; Equilibré et Meilleur conservent la variante uniquement lorsque la notation calibrée améliore le résultat. La valeur par défaut est `true` pour `best` et `false` pour `fast`/`balanced` |
| engine | string | Non | - | Alias ​​de compatibilité obsolète. Utilisez plutôt `quality`. `tesseract` correspond à `fast` ; la valeur `paddleocr` héritée est mappée à `balanced` mais ne charge pas PaddlePaddle |

Lorsque `quality` et `engine` sont omis, SnapOtter choisit le meilleur niveau disponible dans cet ordre : `best`, `balanced`, `fast`. Pour le coréen, `fast` n’est jamais choisi : `best`, puis `balanced` sont utilisés, sinon une erreur d’installation ou de compatibilité du moteur précis est renvoyée.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5", "enhance": true}'
```

## Exemple de réponse {#example-response}

Renvoie `202 Accepted`. Suivez la progression via SSE à `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Remarques {#notes}

- Format d'entrée accepté : `.pdf`.
- `fast` est intégré et ajoute environ 25 MiB à l'image officielle. `balanced` et `best` nécessitent le pack OCR précis en option (environ 208-234 MiB à télécharger et 409-488 MiB installés, selon la cible).
- Le pack précis prend en charge Linux amd64 et arm64 et utilise ONNX Runtime sur CPU, y compris sur les hôtes NVIDIA.
- Un niveau explicitement demandé n'est jamais rétrogradé silencieusement. Si `balanced` ou `best` n'est pas disponible, API renvoie `501` avec `FEATURE_NOT_INSTALLED` ou `FEATURE_INCOMPATIBLE`.
- Les pages PDF sont pixellisées en haute résolution avant OCR. `best` exécute les modèles PP-OCRv6 moyens de plus haute précision et note des variantes d'orientation et d'amélioration, améliorant ainsi la reconnaissance au détriment de la vitesse.
- Le paramètre de langue `auto` permet la reconnaissance dans l'ensemble de scripts pris en charge ; une indication explicite peut améliorer les résultats pour un langage de document connu.
- Vous pouvez cibler des pages spécifiques à l'aide de plages (`"1-3"`), de listes séparées par des virgules (`"1,3,5"`), ou de `"all"` pour chaque page.
- Une demande peut traiter au maximum 50 pages. Les données de travail rastérisées sont limitées à 512 MiB et la réponse UTF-8 OCR globale est limitée à 1 000 000 octets ; les tâches dépassant la limite échouent plutôt que de renvoyer un texte partiel.
- Pour les PDF qui contiennent déjà du texte sélectionnable, envisagez plutôt d'utiliser l'outil [PDF vers texte](./pdf-to-text), plus rapide.
