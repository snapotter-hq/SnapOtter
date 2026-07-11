---
description: "Monter ou baisser la hauteur de l'audio par demi-tons sans changer la vitesse."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 724d8472c29b
---

# Décalage de hauteur {#pitch-shift}

Monter ou baisser la hauteur d'un fichier audio d'un nombre de demi-tons sans changer sa vitesse de lecture.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Accepte des données de formulaire multipart avec un fichier audio et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | Non | `3` | Demi-tons à décaler (-12 à 12). Doit être différent de zéro. |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
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

- Les valeurs positives montent la hauteur ; les valeurs négatives la baissent.
- Un décalage de 12 demi-tons équivaut à une octave vers le haut ; -12 équivaut à une octave vers le bas.
- La durée de lecture reste identique quelle que soit l'ampleur du décalage.
- La sortie conserve généralement le conteneur d'entrée. Une entrée AAC est écrite en M4A, et les entrées à décodage seul non prises en charge se replient sur le MP3.
