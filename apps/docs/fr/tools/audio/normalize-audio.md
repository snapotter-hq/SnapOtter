---
description: "Uniformiser le volume aux niveaux standard de diffusion (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 44d1e25c0c86
---

# Normaliser l'audio {#normalize-audio}

Uniformiser le volume audio aux niveaux standard de diffusion à l'aide de la normalisation EBU R128 (-16 LUFS).

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

Cet outil n'a aucun paramètre configurable. Il applique automatiquement la normalisation du volume EBU R128.

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Utilise le standard de volume EBU R128, visant -16 LUFS.
- Idéal pour les podcasts, les livres audio et les contenus de diffusion où un volume constant est important.
- La fréquence d'échantillonnage source est préservée dans la sortie.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
