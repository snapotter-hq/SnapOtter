---
description: "Passe le texte en MAJUSCULES, minuscules, casse de titre, casse de phrase et plus."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 5c640025d10d
i18n_hash_version: 2
---

# Changer la casse {#convert-case}

Collez du texte, choisissez une casse et copiez le résultat. Le texte va vers votre propre serveur SnapOtter et nulle part ailleurs.

## Point de terminaison de l'API {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

Accepte un corps JSON, et non des données de formulaire multipart, et répond avec le texte converti plutôt qu'avec un fichier à télécharger.

## Paramètres {#parameters}

| Nom | Type | Par défaut | Description |
|------|------|---------|-------------|
| `text` | string | (requis) | Texte à convertir. Jusqu'à 1 000 000 de caractères. |
| `mode` | string | (requis) | L'un des modes ci-dessous. |
| `locale` | string | (aucun) | Balise de langue BCP 47, comme `tr` ou `de`, pour les lettres dont la casse dépend de la langue. Sans elle, la casse est la même pour toutes les langues. |

| Mode | Entrée | Sortie |
|------|-------|--------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## Exemple de réponse {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## Remarques {#notes}

- `title` garde en minuscules les mots anglais courts (a, an, and, of, the, to et similaires), sauf s'ils commencent ou terminent la ligne. `capitalized` met une majuscule à chaque mot.
- `sentence` commence une nouvelle phrase au début du texte, après un saut de ligne et après `.`, `!`, `?` ou `…` suivi d'une espace, de sorte que le point dans `snapotter.com` ou `3.5` ne compte pas.
- `camel`, `pascal`, `snake` et `kebab` découpent aux espaces, à la ponctuation et aux changements de casse existants (`XMLHttpRequest` devient `xml_http_request`), et convertissent chaque ligne séparément.
- Avec `locale` réglé sur `tr`, `i` passe en majuscules en `İ` et `I` passe en minuscules en `ı`. Le `ß` allemand passe en majuscules en `SS` dans toutes les locales.
- L'application web envoie sa langue d'interface actuelle sous la forme `locale`.
