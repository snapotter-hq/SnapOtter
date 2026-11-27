---
description: "Encode du texte en Base64 ou décode du Base64 en texte."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: d9483fcf478d
i18n_hash_version: 2
---

# Encodage / décodage Base64 {#base64}

Collez du texte pour obtenir du Base64, ou collez du Base64 pour retrouver le texte, puis copiez le résultat. Le texte va vers votre propre serveur SnapOtter et nulle part ailleurs.

Pour transformer une image en Base64, utilisez plutôt [Image to Base64](/fr/tools/image/image-to-base64).

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/base64`

Accepte un corps JSON, et non des données de formulaire multipart, et répond avec le texte converti plutôt qu'avec un fichier à télécharger.

## Paramètres {#parameters}

| Nom | Type | Par défaut | Description |
|------|------|---------|-------------|
| `text` | string | (requis) | Texte à encoder, ou Base64 à décoder. Jusqu'à 1 000 000 de caractères. |
| `mode` | string | (requis) | `encode` ou `decode`. |
| `urlSafe` | boolean | `false` | À l'encodage, utilise l'alphabet compatible URL (`-` et `_`) et supprime le remplissage `=`. Ignoré au décodage. |

## Exemple de requête {#example-request}

Encoder :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Décoder :

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Exemple de réponse {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Remarques {#notes}

- Le texte est encodé en UTF-8, donc les lettres accentuées, le CJK et les emoji survivent à l'aller-retour.
- Le décodage ignore les espaces et les sauts de ligne, si bien que le Base64 coupé à 76 colonnes (e-mail, corps PEM) se décode tel que collé.
- Le décodage accepte une entrée avec ou sans remplissage `=`, dans l'alphabet standard (`+`, `/`) ou compatible URL (`-`, `_`), mais pas un mélange des deux.
- Une entrée qui n'est pas du Base64 échoue avec une erreur 400 et le code `ENCODED_TEXT_INVALID`. Un Base64 valide qui se décode en données binaires (une image, un ZIP) plutôt qu'en texte UTF-8 échoue avec `DECODED_DATA_NOT_TEXT`.
