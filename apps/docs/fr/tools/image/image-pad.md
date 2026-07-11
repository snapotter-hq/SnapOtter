---
description: "Ajoutez une marge à une image jusqu'à un rapport d'aspect cible avec un fond de couleur unie, transparent ou flouté."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 7d866a30e05c
---

# Marge d'image {#image-pad}

Ajoutez une marge à une image jusqu'à un rapport d'aspect cible en ajoutant autour d'elle un fond de couleur unie, transparent ou flouté. Utile pour adapter des images à des rapports d'aspect fixes pour les réseaux sociaux ou l'impression sans recadrage.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Accepte des données de formulaire multipart avec une image et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| target | string | Non | `"1:1"` | Rapport d'aspect cible : `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, ou `custom` |
| ratioW | integer | Non | `1` | Largeur de ratio personnalisée (1-100, utilisée quand target vaut `custom`) |
| ratioH | integer | Non | `1` | Hauteur de ratio personnalisée (1-100, utilisée quand target vaut `custom`) |
| background | string | Non | `"color"` | Mode de fond : `color`, `transparent`, ou `blur` |
| color | string | Non | `"#ffffff"` | Couleur de fond hexadécimale (quand background vaut `color`) |
| padding | integer | Non | `0` | Marge supplémentaire en pourcentage du canevas (0-50) |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Notes {#notes}

- Le mode de fond `blur` crée une copie floutée de l'image d'origine comme remplissage de marge, produisant un résultat visuellement cohérent.
- Lors de l'utilisation du fond `transparent`, la sortie est convertie en PNG pour préserver la couche alpha.
- Le format de sortie correspond au format d'entrée, sauf en cas de transparence. Les entrées HEIC, RAW, PSD et SVG sont automatiquement décodées avant le traitement.
- Définissez `target` sur `custom` et fournissez `ratioW` et `ratioH` pour des rapports d'aspect arbitraires (par exemple, `ratioW: 3, ratioH: 2` pour 3:2).
