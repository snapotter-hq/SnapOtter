---
description: "Quelles données d'utilisation anonymes SnapOtter collecte, quand elles sont envoyées et comment désactiver les analyses produit à l'échelle de l'instance."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 96e1a679512b
---

# Ce que SnapOtter collecte {#what-snapotter-collects}

Les analyses produit anonymes sont activées par défaut et définies pour l'ensemble de l'instance par un administrateur. Désactivez-les sous Paramètres > Système > Confidentialité.

## Événements que nous envoyons (lorsqu'ils sont activés) {#events-we-send-when-enabled}

- tool_used : identifiant de l'outil, statut, durée, catégorie, s'il s'agit d'un outil IA, un code d'erreur en cas d'échec.
- pipeline_executed : nombre d'étapes, identifiants des outils, indicateur de lot, nombre de fichiers, durée, statut.
- ai_bundle_action : identifiant du bundle, action, durée.
- Utilisation du frontend : quelles pages d'outils sont ouvertes, fichiers ajoutés (nombres uniquement), outil démarré, téléchargements, enregistrements, recherche (nombre de résultats uniquement), lot traité.
- Rapports de plantage : type d'erreur et une pile source avec uniquement les noms de base des fichiers.

## Ce que nous ne collectons jamais {#what-we-never-collect}

- Noms ou chemins de fichiers
- Contenus de fichiers
- Texte de sortie OCR
- Métadonnées d'image (EXIF)
- Texte extrait de documents
- Votre adresse IP ou votre identité de compte

## Désactivation {#turning-it-off}

Administrateurs : Paramètres > Système > Confidentialité, désactivez « Analyses produit anonymes ». Cela s'arrête immédiatement, à l'échelle de l'instance. Pour construire une image qui ne peut jamais émettre, définissez l'argument de build `SNAPOTTER_ANALYTICS=off`.
