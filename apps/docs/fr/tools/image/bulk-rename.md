---
description: "Renomme plusieurs fichiers à l'aide d'un modèle de motif et les télécharge sous forme de ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: ec51a289e6cb
---

# Renommage en masse {#bulk-rename}

Renomme plusieurs fichiers à l'aide d'un modèle de motif comportant des espaces réservés pour l'index, l'index complété par des zéros et le nom de fichier d'origine. Renvoie une archive ZIP contenant tous les fichiers renommés.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Accepte des données de formulaire multipart contenant plusieurs fichiers et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Par défaut | Description |
|-----------|------|----------|---------|-------------|
| pattern | chaîne | Non | `"image-{{index}}"` | Motif de nommage avec espaces réservés (max 1000 caractères) |
| startIndex | nombre | Non | `1` | Numéro d'index de départ |

### Espaces réservés du motif {#pattern-placeholders}

| Espace réservé | Description | Exemple |
|-------------|-------------|---------|
| `{{index}}` | Numéro séquentiel à partir de `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Numéro séquentiel complété par des zéros | `01`, `02`, `03` |
| `{{original}}` | Nom de fichier d'origine sans extension | `photo`, `IMG_001` |

L'extension du fichier d'origine est toujours préservée.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Cela produit : `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

En utilisant le nom de fichier d'origine :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Cela produit : `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Exemple de réponse {#example-response}

La réponse est un fichier ZIP diffusé directement (et non une réponse JSON). Les en-têtes de la réponse sont :

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Remarques {#notes}

- Cet outil ne traite pas les images. Il se contente de renommer les fichiers et de les regrouper dans une archive ZIP.
- La largeur du complément par des zéros pour `{{padded}}` est déterminée automatiquement en fonction du nombre total de fichiers (par exemple, 100 fichiers utiliseraient un complément à 3 chiffres : `001`, `002`, etc.).
- Les extensions de fichier sont conservées à partir des noms de fichiers d'origine.
- Les noms de fichiers sont assainis pour supprimer les caractères non sûrs.
- Au moins un fichier doit être fourni.
