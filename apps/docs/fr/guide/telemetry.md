---
description: "Quelles données d'utilisation anonymes SnapOtter collecte, quand elles sont envoyées, comment fonctionne le choix du premier lancement et comment désactiver les analyses produit de toute l'instance."
i18n_source_hash: f3cfb0b3f961
i18n_provenance: machine
i18n_output_hash: 29ce9ef10c09
i18n_hash_version: 2
---

# Ce que SnapOtter collecte {#what-snapotter-collects}

Anonymous Product Analytics est défini pour toute l'instance par un administrateur. Une nouvelle instance pose la question au premier lancement et n'envoie rien tant que personne n'a répondu. Vous pouvez le modifier à tout moment dans Settings > System > Privacy.

Lorsque les analyses sont activées, SnapOtter envoie à PostHog les outils et pipelines exécutés, leur durée, leur réussite ou leur échec, les codes d'erreur et le nombre de fichiers, ainsi que l'identifiant anonyme de l'instance, sa version, l'architecture du processeur, le système d'exploitation, le type d'installation et la présence ou non d'un GPU. Les rapports de plantage sont envoyés à Sentry sans les noms de fichiers, les chemins, les adresses e-mail ni les valeurs entre guillemets. Il n'envoie jamais vos fichiers, leurs noms ou chemins, leur contenu, les résultats d'OCR ou le texte extrait, les métadonnées d'image, ni l'identité de votre compte. PostHog et Sentry sont les deux seuls destinataires, et lorsque les analyses sont désactivées, rien n'est envoyé ni à l'un ni à l'autre.

## Choix du premier lancement {#first-run-choice}

La première fois qu'un administrateur ouvre une nouvelle instance, SnapOtter demande : "Envoyer des statistiques d'utilisation anonymes et des rapports de plantage ? Vos fichiers ne sont jamais envoyés." Les deux réponses ont le même poids et aucune n'est présélectionnée. Fermer la fenêtre sans répondre laisse les analyses désactivées et la question est reposée à la visite suivante. Seul un administrateur la voit. Avec `AUTH_ENABLED=false`, il n'y a pas de comptes et l'utilisateur local fait office d'administrateur, donc la personne qui ouvre l'application y répond. L'application de bureau pose la question de la même manière.

Une instance déjà en service avant l'arrivée de cette question n'est pas interrogée. Elle conserve son réglage d'analyses : activées, sauf si un administrateur ou `SNAPOTTER_ANALYTICS_DEFAULT=off` les a désactivées.

## Événements que nous envoyons (lorsque c'est activé) {#events-we-send-when-enabled}

- tool_used : identifiant de l'outil, statut, durée, catégorie, s'il s'agit d'un outil IA, un code d'erreur en cas d'échec, et le nom de l'étape pour un outil qui signale une étape à part (l'étape d'analyse de Passport Photo).
- pipeline_executed : nombre d'étapes, identifiants des outils, indicateur de lot, nombre de fichiers, durée, statut.
- ai_bundle_action : identifiant du bundle, action (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment`, `imported`), durée et, en cas d'échec de l'installation, une catégorie d'échec issue d'une liste fixe (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout`, `other`). La sortie de l'installateur, les chemins et les messages d'erreur ne sont jamais envoyés.
- Utilisation du frontend : quelles pages d'outils sont ouvertes, fichiers ajoutés (nombres uniquement), outil démarré, téléchargements, enregistrements, recherche (nombre de résultats uniquement), lot traité.
- Rapports de plantage : type d'erreur, un message d'erreur expurgé (noms de fichiers, chemins, adresses e-mail et valeurs entre guillemets supprimés), une pile source avec les noms de base des fichiers et, pour les outils IA, une trace Python avec uniquement les noms de base des fichiers.

## Ce que nous ne collectons jamais {#what-we-never-collect}

- Noms ou chemins de fichiers
- Contenu des fichiers
- Texte issu de l'OCR
- Métadonnées d'image (EXIF)
- Texte extrait des documents
- L'identité de votre compte

PostHog voit l'adresse IP d'où provient chaque requête, comme tout serveur. Notre projet PostHog l'écarte au lieu de la stocker, et les événements du serveur de SnapOtter envoient un espace réservé à sa place.

## Notifications de mise à jour {#update-notices}

Tant que les analyses sont activées, le serveur demande à PostHog toutes les quelques heures quelle est la dernière version de SnapOtter, en utilisant l'identifiant anonyme de l'instance et sa version. Lorsqu'une version plus récente existe, les administrateurs voient une notification avec un lien vers les notes de version. Si vous la fermez, elle reste masquée jusqu'à la version suivante. Rien n'est installé ni téléchargé à votre place, et lorsque les analyses sont désactivées, le serveur ne demande jamais rien.

## Le désactiver {#turning-it-off}

Administrateurs : Settings > System > Privacy, désactivez "Anonymous Product Analytics". L'envoi s'arrête immédiatement, pour toute l'instance. Pour construire une image qui ne peut jamais rien émettre, définissez l'argument de build `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` dans l'environnement du serveur produit le même effet à l'exécution et l'emporte sur toute réponse enregistrée dans l'application.

Pour répondre d'avance à la question du premier lancement, ajoutez `SNAPOTTER_ANALYTICS_DEFAULT=off` (ou `on`) à l'environnement du serveur avant son premier démarrage, et personne n'est interrogé. Avec Docker Compose, placez-le sous `environment:` du service de l'application, car le définir uniquement dans `.env` n'atteint pas le conteneur.
