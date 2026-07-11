---
description: "Structure du monorepo, architecture des applications et des packages, cycle de vie des requêtes et empreinte de ressources de SnapOtter."
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: 31c734145cf5
---

# Architecture {#architecture}

SnapOtter est un monorepo géré avec les espaces de travail pnpm et Turborepo. Il se déploie sous forme de pile Docker Compose à 3 conteneurs : l'image de l'application SnapOtter, PostgreSQL 17 et Redis 8.

## Structure du projet {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Packages {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

La bibliothèque principale de traitement d'images construite sur [Sharp](https://sharp.pixelplumbing.com/). Elle gère toutes les opérations sans IA : redimensionnement, rognage, rotation, retournement, conversion, compression, suppression des métadonnées et ajustements de couleur (luminosité, contraste, saturation, niveaux de gris, sépia, inversion, canaux de couleur).

Ce package n'a aucune dépendance réseau et s'exécute entièrement en cours de processus.

### `@snapotter/ai` {#snapotter-ai}

Une couche de pont qui appelle des scripts Python pour les opérations de ML. Lors de la première utilisation, le pont démarre un processus dispatcher Python persistant qui pré-importe les bibliothèques lourdes (PIL, NumPy, MediaPipe, rembg) afin que les appels d'IA suivants évitent le surcoût d'import. Si le dispatcher n'est pas encore prêt, le pont se rabat sur le lancement d'un nouveau sous-processus Python par requête.

**Les modèles ne sont pas préchargés.** Chaque script d'outil charge les poids de son modèle depuis le disque au moment de la requête et les libère une fois la requête terminée. Consultez [Empreinte de ressources](#resource-footprint) pour le profil mémoire complet.

Opérations prises en charge : suppression d'arrière-plan (rembg/BiRefNet), agrandissement (RealESRGAN), floutage des visages (MediaPipe), amélioration des visages (GFPGAN/CodeFormer), effacement d'objets (LaMa ONNX), OCR (PaddleOCR/Tesseract), colorisation (DDColor), suppression du bruit, suppression des yeux rouges, restauration de photos, génération de photos d'identité, correction de la transparence (matting HR BiRefNet) et redimensionnement adaptatif au contenu (binaire Go caire).

Les scripts Python se trouvent dans `packages/ai/python/`. L'image Docker pré-télécharge tous les poids des modèles pendant la build afin que le conteneur fonctionne entièrement hors ligne.

### `@snapotter/shared` {#snapotter-shared}

Types TypeScript partagés, constantes (comme `APP_VERSION` et les définitions d'outils) et chaînes de traduction i18n utilisées à la fois par le frontend et le backend.

## Applications {#applications}

### API (`apps/api`) {#api-apps-api}

Un serveur Fastify v5 exposant 241 routes d'outils réparties sur cinq modalités (image, vidéo, audio, PDF, fichier) qui gère :
- Les téléversements de fichiers, la gestion de l'espace de travail temporaire et le stockage persistant des fichiers
- La bibliothèque de fichiers utilisateur avec chaînes de versions (table `user_files`) - chaque résultat traité renvoie à son fichier source et enregistre l'outil appliqué, avec des vignettes auto-générées pour la page Fichiers
- L'exécution des outils (achemine chaque requête d'outil vers le moteur d'images ou le pont d'IA)
- L'orchestration de pipelines (enchaînement séquentiel de plusieurs outils)
- Le traitement par lots avec contrôle de la concurrence via les files d'attente de tâches BullMQ (pools : image, media, ai, docs, system)
- L'authentification des utilisateurs, le RBAC (rôles admin/user avec un ensemble complet de permissions), la gestion des clés d'API et la limitation de débit
- La gestion des équipes - CRUD réservé aux admins ; les utilisateurs sont affectés à une équipe via le champ `team` de leur profil
- Les paramètres d'exécution - un magasin clé-valeur dans la table `settings` qui contrôle `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` et d'autres réglages opérationnels sans redéploiement
- L'image de marque personnalisée et les préférences d'exécution via des paramètres stockés en base de données
- La documentation Scalar/OpenAPI à `/api/docs`
- La distribution du frontend compilé sous forme de SPA en production

Dépendances clés : Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod pour la validation.

Le serveur gère l'arrêt gracieux sur SIGTERM/SIGINT : il draine les connexions HTTP, arrête les workers BullMQ, arrête le dispatcher Python et ferme la connexion à la base de données.

### Web (`apps/web`) {#web-apps-web}

Une application monopage React 19 construite avec Vite. Utilise Zustand pour la gestion de l'état, Tailwind CSS v4 pour le style et Lucide pour les icônes. Communique avec l'API via REST et SSE (pour le suivi de la progression).

Les pages comprennent un espace de travail d'outils, une page Fichiers pour gérer les téléversements et résultats persistants, un constructeur d'automatisation/pipeline, et un panneau de paramètres d'administration.

Le frontend compilé est distribué par le backend Fastify en production, il n'y a donc pas de serveur web distinct dans le conteneur Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Ce site VitePress. Déployé automatiquement sur Cloudflare Pages à chaque push sur `main`.

## Cheminement d'une requête {#how-a-request-flows}

1. L'utilisateur choisit un outil dans l'interface web et téléverse un fichier.
2. Le frontend envoie une requête POST multipart à `/api/v1/tools/:section/:toolId` avec le fichier et les paramètres.
3. La route de l'API valide l'entrée avec Zod, puis lance le traitement.
4. Pour les outils standards, la tâche est mise en file d'attente dans le pool BullMQ approprié (image, media ou docs selon la modalité). Le worker BullMQ en cours de processus oriente automatiquement l'image d'après les métadonnées EXIF, exécute la fonction de traitement de l'outil et renvoie le résultat.
5. Pour les outils d'IA, le pont TypeScript envoie une requête au dispatcher Python persistant (ou lance un nouveau sous-processus en repli), attend qu'il termine et lit le fichier de sortie.
6. La progression de la tâche est persistée dans la table `jobs` de PostgreSQL afin que l'état survive aux redémarrages du conteneur. Les mises à jour en temps réel sont livrées via SSE à `/api/v1/jobs/:jobId/progress`.
7. L'API renvoie un `jobId` et une `downloadUrl`. L'utilisateur télécharge le fichier traité depuis `/api/v1/download/:jobId/:filename`.

Pour les pipelines, l'API alimente l'étape suivante avec la sortie de chaque étape, en les exécutant séquentiellement.

Pour le traitement par lots, l'API utilise des flux BullMQ avec des tâches enfants par étape et renvoie un fichier ZIP contenant tous les fichiers traités.

## Empreinte de ressources {#resource-footprint}

SnapOtter est conçu pour une faible utilisation de mémoire au repos. Rien n'est préchargé ni maintenu chaud au démarrage.

### Au repos {#at-idle}

Le processus Node.js/Fastify, PostgreSQL et Redis sont en cours d'exécution. La RAM typique au repos est de **~200 à 300 Mo** répartie sur les trois conteneurs (processus Node.js, Postgres et Redis). Aucun processus Python, aucun poids de modèle en mémoire.

### Ce qui démarre, et quand {#what-starts-and-when}

| Composant | Démarre quand | Mémoire pendant l'activité |
|-----------|-------------|---------------------|
| Serveur Fastify + Postgres + Redis | Démarrage du conteneur | ~200 à 300 Mo au total |
| Workers BullMQ | Démarrage du conteneur (en cours de processus) | Un worker par pool (image, media, ai, docs, system) |
| Dispatcher Python | Première requête d'outil d'IA | Interpréteur Python + bibliothèques pré-importées (PIL, NumPy, MediaPipe, rembg) - aucun poids de modèle |
| Poids des modèles d'IA | Pendant la requête de l'outil concerné | Chargés depuis le disque, libérés à la fin de la requête |

### Chargement des modèles {#model-loading}

Tous les fichiers de poids des modèles (totalisant plusieurs Go) résident en permanence sur le disque dans `/opt/models/`. Chaque script d'outil d'IA charge en mémoire uniquement son ou ses modèles pour la durée d'une requête, puis les libère. Certains scripts appellent explicitement `del model` et `torch.cuda.empty_cache()` après l'inférence pour garantir la restitution immédiate de la mémoire.

Il n'y a pas de cache de modèles entre les requêtes. Exécuter le même outil d'IA de manière consécutive recharge le modèle à chaque fois. Cela maintient la mémoire au repos proche de zéro au prix d'un délai de chargement du modèle à chaque requête d'IA.

### Démarrage à froid de la première requête d'IA {#first-ai-request-cold-start}

Le dispatcher Python n'est pas en cours d'exécution au démarrage du conteneur. La première requête d'IA déclenche deux choses en parallèle : le dispatcher commence à se préchauffer en arrière-plan, et la requête elle-même se rabat sur le lancement ponctuel d'un sous-processus Python. Une fois que le dispatcher signale qu'il est prêt, toutes les requêtes d'IA suivantes l'utilisent directement et évitent le coût du lancement d'un sous-processus.
