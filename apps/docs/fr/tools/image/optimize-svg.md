---
description: "Minifiez des fichiers SVG avec svgo et conservez le résultat en SVG vectoriel, avec réglages de précision, de passes multiples, de métadonnées et de mise en forme."
i18n_source_hash: 07a564ab53dd
i18n_provenance: machine
i18n_output_hash: 10912efa4152
i18n_hash_version: 2
---

# Optimiser un SVG {#optimize-svg}

Réduisez la taille des fichiers SVG en supprimant les résidus d'éditeur, les attributs redondants et les décimales superflues, puis téléchargez le résultat en SVG. Contrairement à « Optimiser pour le web », la sortie n'est jamais rastérisée.

## Point de terminaison API {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Accepte des données de formulaire multipart avec un fichier `.svg` ou `.svgz` et un champ JSON `settings`.

## Paramètres {#parameters}

| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|----------|---------|-------------|
| precision | number | Non | `3` | Nombre de décimales conservées dans les données de tracé et les nombres (0 à 8). Des valeurs plus basses donnent des fichiers plus petits et des courbes un peu moins fines. |
| multipass | boolean | Non | `true` | Relancer l'optimiseur jusqu'à ce que la sortie cesse de diminuer |
| removeMetadata | boolean | Non | `true` | Supprimer les commentaires, `<metadata>`, les éléments `<desc>` vides ou générés par des éditeurs et les données propres aux éditeurs. Désactivez cette option pour les conserver. |
| pretty | boolean | Non | `false` | Indenter la sortie pour la lisibilité au lieu de la minifier sur quelques lignes |

## Exemple de requête {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Exemple de réponse {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Remarques {#notes}

- L'entrée doit être un fichier SVG ou SVGZ. Une image matricielle est rejetée avec `400` et le code `IMAGE_UNDECODABLE`.
- Une entrée `.svgz` est d'abord décompressée, et la sortie est toujours un `.svg` simple.
- Le SVG est limité à 10 Mo après décompression. Un fichier plus gros est rejeté avec `400` et le code `SVG_TOO_LARGE`.
- `viewBox` et `<title>` sont toujours conservés, de sorte que le graphisme reste redimensionnable et garde son nom accessible.
- L'entrée et la sortie passent toutes deux par le nettoyeur SVG, qui supprime les scripts et autres contenus actifs.
- Réduire `precision` est le meilleur gain de taille pour les illustrations riches en tracés. Vérifiez le résultat visuellement entre 0 et 2.
