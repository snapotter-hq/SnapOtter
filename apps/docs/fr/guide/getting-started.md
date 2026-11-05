---
description: "Installez SnapOtter avec Docker en une seule commande. Comprend la configuration Docker Compose, la compilation depuis les sources et un aperçu complet des fonctionnalités."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: 220931b9d193
i18n_hash_version: 2
---

# Prise en main {#getting-started}

::: tip Essayer avant d'installer
Explorez l'interface complète sur [demo.snapotter.com](https://demo.snapotter.com), sans inscription ni installation.
:::

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ce conteneur unique exécute tout ce dont il a besoin : sans `DATABASE_URL` défini, il démarre son propre PostgreSQL et son propre Redis sur l'interface de bouclage (mode embarqué) et conserve toutes les données dans le volume `SnapOtter-data`. C'est le moyen le plus rapide d'essayer SnapOtter ou de l'auto-héberger sur un homelab. Pour la production, utilisez la [pile Docker Compose de référence](#docker-compose), qui garde PostgreSQL et Redis dans leurs propres conteneurs. Le mode embarqué s'exécute en tant que root (comportement par défaut) et se désactive automatiquement dès que vous définissez `DATABASE_URL`.

Vous installez sur un Raspberry Pi, un vieil ordinateur portable ou un petit VPS ? Consultez [Configurations à faibles ressources](/fr/guide/low-resource) pour un pas-à-pas adapté et ce à quoi vous attendre avec du matériel limité.

Il vous sera demandé de changer votre mot de passe lors de la première connexion.

::: tip Analyses de produit anonymes
SnapOtter inclut par défaut des analyses de produit anonymes. Pour les désactiver, ouvrez **Paramètres → Système → Confidentialité** et désactivez **Analyses de produit anonymes**. Elles s'arrêtent immédiatement pour toute l'instance.

Vous pouvez aussi définir la variable d'environnement `SNAPOTTER_TELEMETRY=0` (`false` et `off` fonctionnent également) pour désactiver toute la télémétrie de l'instance sans reconstruction.

La surveillance des erreurs repose sur [Sentry](https://sentry.io), qui parraine SnapOtter via son programme open source.

Pour savoir précisément ce qui est collecté, consultez [Ce que SnapOtter collecte](/fr/guide/telemetry).
:::

::: tip Accélération NVIDIA CUDA
Ajoutez `--gpus all` pour la suppression d'arrière-plan, l'agrandissement, l'amélioration des visages et la restauration accélérés par NVIDIA CUDA. L'OCR reste basé sur le CPU et fonctionne avec la même image, avec ou sans accès au GPU :

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Nécessite le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Bascule automatiquement sur le CPU lorsque CUDA n'est pas disponible. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA. Consultez [Tags Docker](/fr/guide/docker-tags) pour les benchmarks. Si les outils d'IA s'exécutent sur le CPU malgré `--gpus all`, consultez [Vérifier l'accélération GPU](/fr/guide/deployment#verify-gpu-acceleration).
:::

::: details Également sur GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Les deux registres publient la même image à chaque version.
:::

## Docker Compose {#docker-compose}

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

Le [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) de référence inclut les quatre volumes d'exécution, les contrôles de santé, les limites de ressources, une configuration Redis durable, des images de base de données et de cache épinglées, ainsi que le durcissement actuel des conteneurs. Changez le mot de passe administrateur par défaut dès la première connexion. Pour un déploiement reproductible, épinglez l'image de l'application SnapOtter sur le tag de version ou le digest que vous avez vérifié, au lieu de suivre `latest`.

Consultez [Configuration](/fr/guide/configuration) pour toutes les variables d'environnement et [Sécurité et durcissement](/fr/guide/security) pour les secrets, la politique réseau et les conseils de sauvegarde.

## Compiler depuis les sources {#build-from-source}

**Prérequis :** Node.js 22.22+, pnpm 9+, Docker (pour Postgres + Redis), Python 3.11+ (pour les fonctionnalités d'IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend : [http://localhost:1351](http://localhost:1351)
- Backend : [http://localhost:13490](http://localhost:13490)

## Ce que vous pouvez faire {#what-you-can-do}

### Traitement de fichiers (200+ outils) {#file-processing-200-tools}

| Modalité | Nombre | Exemples d'outils |
|----------|-------|---------------|
| **Image** | 112 | Redimensionner, Recadrer, Compresser, Convertir, Supprimer l'arrière-plan, Agrandir, OCR, Filigrane, Collage, Coloriser, Outils GIF, préréglages de format |
| **Vidéo** | 57 | Couper, Recadrer, Compresser, Convertir, Fusionner, Extraire l'audio, Sous-titres automatiques, Vidéo vers GIF, Redimensionner, Stabiliser, préréglages de format |
| **Audio** | 27 | Couper, Fusionner, Convertir, Normaliser, Réduction du bruit, Transcrire, Changement de hauteur, Fondu, Créateur de sonneries, préréglages de format |
| **PDF / Document** | 35 | Fusionner, Diviser, Compresser, OCR, Filigrane, Caviarder, Word vers PDF, Excel vers PDF, Pivoter, Protéger, Réparer |
| **Fichiers** | 23 | CSV vers JSON, JSON vers XML, Fusionner des CSV, Diviser un CSV, Créer un ZIP, Extraire un ZIP, Créateur de graphiques, YAML/JSON |

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
