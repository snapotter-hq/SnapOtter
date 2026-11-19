---
description: "Installez SnapOtter avec Docker en une seule commande, connectez-vous et ouvrez votre premier outil. Couvre l'accélération GPU, les petites machines, Docker Compose et la compilation depuis les sources."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 1ef4ca1dc082
i18n_hash_version: 2
---

# Prise en main {#getting-started}

::: tip Essayer avant d'installer
Explorez l'interface complète sur [demo.snapotter.com](https://demo.snapotter.com), sans inscription ni installation.
:::

## Démarrage rapide {#quick-start}

Exécutez une seule commande :

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ouvrez ensuite [http://localhost:1349](http://localhost:1349) et connectez-vous avec `admin` / `admin`. Il vous sera demandé de changer votre mot de passe lors de la première connexion.

Ouvrez maintenant un outil. Choisissez-en un dans la barre latérale, ou allez directement à [Redimensionner](http://localhost:1349/image/resize), déposez une image et téléchargez le résultat.

Voilà toute l'installation. Ce conteneur unique exécute tout ce dont il a besoin : sans `DATABASE_URL` défini, il démarre son propre PostgreSQL et son propre Redis sur l'interface de bouclage (mode embarqué) et conserve toutes les données dans le volume `SnapOtter-data`. C'est le moyen le plus rapide d'essayer SnapOtter ou de l'auto-héberger sur un homelab. Le mode embarqué s'exécute en tant que root (comportement par défaut) et se désactive automatiquement dès que vous définissez `DATABASE_URL`. Pour la production, utilisez la [pile Docker Compose](#docker-compose), qui garde PostgreSQL et Redis dans leurs propres conteneurs.

Les résultats des tâches ne sont pas conservés dans le volume de données : ils disparaissent quand le conteneur est remplacé (lors d'une mise à jour de l'image, par exemple) et leurs liens de téléchargement cessent de fonctionner. [Conserver les résultats des tâches](/fr/guide/deployment#keeping-job-output) dans le guide de déploiement explique comment les garder.

::: tip Utilisation avec 4 Go de RAM ou moins
Sur un Raspberry Pi, un vieil ordinateur portable ou un petit VPS, exécutez une tâche à la fois et limitez le pool de threads d'images en ajoutant `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` à la commande ci-dessus, et évitez les bundles d'IA volumineux. [Configurations à faibles ressources](/fr/guide/low-resource#tuning-knobs) présente les autres limites utiles à définir et ce à quoi vous attendre avec du matériel limité.
:::

::: tip Analyses de produit anonymes
SnapOtter inclut par défaut des analyses de produit anonymes. Pour les désactiver, ouvrez **Paramètres → Système → Confidentialité** et désactivez **Analyses de produit anonymes**. Elles s'arrêtent immédiatement pour toute l'instance.

Vous pouvez aussi définir la variable d'environnement `SNAPOTTER_TELEMETRY=0` (`false` et `off` fonctionnent également) pour désactiver toute la télémétrie de l'instance sans reconstruction.

La surveillance des erreurs repose sur [Sentry](https://sentry.io), qui parraine SnapOtter via son programme open source.

Pour savoir précisément ce qui est collecté, consultez [Ce que SnapOtter collecte](/fr/guide/telemetry).
:::

## Accélération GPU {#gpu-acceleration}

Un GPU NVIDIA accélère nettement les outils d'IA les plus lourds : agrandissement (environ 47 fois), amélioration des visages (environ 12 fois), transcription et suppression d'arrière-plan (environ 4 fois chacune). L'OCR, la détection de visages et la restauration de photos restent basés sur le CPU, donc un GPU ne les aide pas. La même image couvre les deux cas ; ajoutez `--gpus all` :

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Nécessite le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) sur l'hôte. Sans CUDA, SnapOtter bascule automatiquement sur le CPU. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA.

- [Configuration matérielle requise](/fr/guide/deployment#full-ai-tools-on-nvidia-cuda) détaille les temps GPU et CPU, et les [benchmarks de l'image Docker](/fr/guide/docker-tags#benchmarks) donnent les chiffres à chaud et à froid.
- Si les outils d'IA s'exécutent toujours sur le CPU, consultez [Vérifier l'accélération GPU](/fr/guide/deployment#verify-gpu-acceleration).
- Pour Compose, utilisez le [démarrage rapide NVIDIA CUDA](/fr/guide/deployment#quick-start-nvidia-cuda) du guide de déploiement.

## Autres méthodes d'installation {#other-ways-to-install}

### Conteneur unique avec Compose {#single-container-compose}

Le même conteneur en mode embarqué que dans le démarrage rapide, écrit sous forme de fichier Compose pour être plus facile à suivre et à modifier. Enregistrez-le sous `docker-compose.yml` et exécutez `docker compose up -d` :

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

Comme la commande `docker run`, ceci sert à essayer SnapOtter et aux petites installations. Chaque paramètre de [Configuration](/fr/guide/configuration) se place sous `environment`.

### Docker Compose (production) {#docker-compose}

Utilisez le fichier de production maintenu et testé à chaque version plutôt que de copier un exemple Compose abrégé depuis cette page :

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Ouvrez [http://localhost:1349](http://localhost:1349) et connectez-vous avec `admin` / `admin`.

Le [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) de référence inclut les quatre volumes d'exécution, les contrôles de santé, les limites de ressources, une configuration Redis durable, des images de base de données et de cache épinglées, ainsi que le durcissement actuel des conteneurs. Changez le mot de passe administrateur par défaut dès la première connexion. Pour un déploiement reproductible, épinglez l'image de l'application SnapOtter sur le tag de version ou le digest que vous avez vérifié, au lieu de suivre `latest`.

Consultez [Configuration](/fr/guide/configuration) pour toutes les variables d'environnement et [Sécurité et durcissement](/fr/guide/security) pour les secrets, la politique réseau et les conseils de sauvegarde.

### GitHub Container Registry {#ghcr}

Docker Hub et GHCR publient la même image à chaque version. Pour télécharger depuis GHCR, changez le nom de l'image :

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Compiler depuis les sources {#build-from-source}

**Prérequis :** Node.js 22.22+, pnpm 9+, Docker (pour Postgres + Redis), Python 3.11+ (pour les fonctionnalités d'IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Ce que vous pouvez faire {#what-you-can-do}

### Traitement de fichiers (200+ outils) {#file-processing-200-tools}

| Modalité | Nombre | Exemples d'outils |
|----------|-------|---------------|
| **Image** | 112 | Redimensionner, Recadrer, Compresser, Convertir, Supprimer l'arrière-plan, Agrandir, OCR, Filigrane, Collage, Coloriser, Outils GIF, préréglages de format |
| **Vidéo** | 59 | Couper, Recadrer, Compresser, Convertir, Fusionner, Extraire l'audio, Sous-titres automatiques, Vidéo vers GIF, Redimensionner, Stabiliser, préréglages de format |
| **Audio** | 27 | Couper, Fusionner, Convertir, Normaliser, Réduction du bruit, Transcrire, Changement de hauteur, Fondu, Créateur de sonneries, préréglages de format |
| **PDF / Document** | 37 | Fusionner, Diviser, Compresser, OCR, Filigrane, Caviarder, Word vers PDF, Excel vers PDF, Pivoter, Protéger, Réparer |
| **Fichiers** | 25 | CSV vers JSON, JSON vers XML, Fusionner des CSV, Diviser un CSV, Créer un ZIP, Extraire un ZIP, Créateur de graphiques, YAML/JSON |

### Pipelines {#pipelines}

Enchaînez des outils en flux de travail à plusieurs étapes et appliquez-les à une image ou à un lot entier :

1. Ouvrez **Pipelines** dans la barre latérale.
2. Ajoutez des étapes (n'importe quel outil, avec n'importe quels paramètres).
3. Exécutez sur un seul fichier, ou sur un lot entier d'un coup.
4. Enregistrez le pipeline pour le réutiliser plus tard.

Les pipelines acceptent 20 étapes par défaut. Définissez `MAX_PIPELINE_STEPS=0` pour rendre la limite illimitée.

### Bibliothèque de fichiers {#file-library}

Chaque fichier que vous traitez peut être enregistré dans votre bibliothèque **Fichiers**. SnapOtter conserve l'historique complet des versions afin que vous puissiez retracer chaque étape de traitement, du téléversement d'origine au résultat final.

L'enregistrement est explicite : les résultats que vous enregistrez dans la bibliothèque sont conservés jusqu'à ce que vous les supprimiez, tandis que les résultats traités et non enregistrés sont effacés automatiquement après 72 heures (configurable via `FILE_MAX_AGE_HOURS`).

### API REST et clés d'API {#rest-api-api-keys}

Chaque outil est accessible via HTTP :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Générez des clés d'API dans **Paramètres → Clés d'API**. Consultez la [référence de l'API REST](/fr/api/rest) pour tous les points de terminaison, ou rendez-vous sur [http://localhost:1349/api/docs](http://localhost:1349/api/docs) pour la référence interactive.

### Multi-utilisateur et équipes {#multi-user-teams}

Activez plusieurs utilisateurs avec un contrôle d'accès basé sur les rôles :

- **Admin** : accès complet, avec gestion des utilisateurs, des équipes, des paramètres, ainsi que de tous les fichiers, pipelines et clés d'API
- **Utilisateur** : utilise les outils et gère ses propres fichiers, pipelines et clés d'API

Créez des équipes dans **Paramètres → Équipes** pour regrouper les utilisateurs.

Définissez `AUTH_ENABLED=true` (ou `false` pour un usage personnel ou mono-utilisateur sans connexion).

## L'utiliser depuis votre téléphone {#use-it-from-your-phone}

SnapOtter fonctionne dans les navigateurs mobiles, et vous pouvez l'installer comme une application. Ouvrez votre instance sur le téléphone, puis :

- **iPhone / iPad (Safari) :** appuyez sur Partager, puis sur **Sur l'écran d'accueil**.
- **Android (Chrome) :** ouvrez le menu du navigateur et appuyez sur **Installer l'application**.

L'application installée s'ouvre dans sa propre fenêtre, directement sur votre instance.

Un bémol : les navigateurs ne proposent l'invite d'installation qu'en HTTPS. Une simple adresse HTTP sur votre réseau local fonctionne très bien dans un onglet de navigateur ; pour une vraie installation, placez l'instance derrière un reverse proxy avec un certificat (consultez le [guide de déploiement](/fr/guide/deployment)).

Sur les téléphones et les tablettes, les outils d'image affichent un bouton **Prendre une photo** à côté du bouton de téléversement. Photographiez un reçu ou un tableau blanc et l'image arrive directement dans l'outil.
