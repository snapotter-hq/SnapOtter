---
description: "Quelles données d'utilisation anonymes SnapOtter collecte, quand elles sont envoyées et comment désactiver les analyses produit à l'échelle de l'instance."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: 43fe4ef2586d
i18n_hash_version: 2
---

# Ce que SnapOtter collecte {#what-snapotter-collects}

Les analyses produit anonymes sont activées par défaut et définies pour l'ensemble de l'instance par un administrateur. Désactivez-les sous Paramètres > Système > Confidentialité.

## Événements que nous envoyons (lorsqu'ils sont activés) {#events-we-send-when-enabled}

- tool_used : identifiant de l'outil, statut, durée, catégorie, s'il s'agit d'un outil IA, un code d'erreur en cas d'échec.
- pipeline_executed : nombre d'étapes, identifiants des outils, indicateur de lot, nombre de fichiers, durée, statut.
- ai_bundle_action : identifiant du bundle, action, durée.
- Utilisation du frontend : quelles pages d'outils sont ouvertes, fichiers ajoutés (nombres uniquement), outil démarré, téléchargements, enregistrements, recherche (nombre de résultats uniquement), lot traité.
- Rapports de plantage : type d'erreur, un message d'erreur expurgé (noms de fichiers, chemins, adresses e-mail et valeurs entre guillemets supprimés), une pile source avec les noms de base des fichiers et, pour les outils IA, une trace Python avec uniquement les noms de base des fichiers.

## Ce que nous ne collectons jamais {#what-we-never-collect}

- Noms ou chemins de fichiers
- Contenus de fichiers
- Texte de sortie OCR
- Métadonnées d'image (EXIF)
- Texte extrait de documents
- Votre identité de compte

Comme n'importe quel serveur, PostHog voit l'adresse IP d'où provient chaque requête. Notre projet PostHog la supprime au lieu de la stocker, et les événements envoyés par le serveur SnapOtter lui-même transmettent une valeur fictive à sa place.

## Avis de mise à jour {#update-notices}

Tant que l'analyse est activée, le serveur demande à PostHog toutes les quelques heures quelle est la version la plus récente de SnapOtter, à l'aide de l'identifiant anonyme de l'instance et de sa version. Lorsqu'une version plus récente existe, les administrateurs voient un avis avec un lien vers les notes de version. Si vous le fermez, il reste masqué jusqu'à la version suivante. Rien n'est installé ni téléchargé à votre place, et lorsque l'analyse est désactivée, le serveur ne pose jamais la question.

## Désactivation {#turning-it-off}

Administrateurs : Paramètres > Système > Confidentialité, désactivez « Analyses produit anonymes ». Cela s'arrête immédiatement, à l'échelle de l'instance. Pour construire une image qui ne peut jamais émettre, définissez l'argument de build `SNAPOTTER_ANALYTICS=off`.

Pour démarrer une nouvelle instance avec l'analyse déjà désactivée, ajoutez `SNAPOTTER_ANALYTICS_DEFAULT=off` à l'environnement du serveur avant son premier démarrage. Avec Docker Compose, placez-la sous `environment:` du service de l'application, car la définir uniquement dans `.env` ne l'amène pas jusqu'au conteneur.
