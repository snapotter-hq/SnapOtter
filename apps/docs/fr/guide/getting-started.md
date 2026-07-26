---
description: "Installez SnapOtter avec Docker en une seule commande. Inclut la configuration Docker Compose, la construction depuis les sources et un aperçu complet des fonctionnalités."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: b1cfb0a22eba
i18n_hash_version: 2
---

# Prise en main {#getting-started}

::: tip Essayez avant d'installer
Explorez l'interface complète sur [demo.snapotter.com](https://demo.snapotter.com) - aucune inscription ni installation requise.
:::

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ce conteneur unique exécute tout ce dont il a besoin : sans `DATABASE_URL` défini, il démarre ses propres PostgreSQL et Redis sur l'interface de bouclage (mode intégré) et conserve toutes les données dans le volume `SnapOtter-data`. C'est le moyen le plus rapide d'essayer SnapOtter ou de s'auto-héberger sur un homelab. Pour la production, utilisez la [pile canonique Docker Compose](#docker-compose), qui conserve PostgreSQL et Redis dans leurs propres conteneurs. Le mode intégré s'exécute en tant que root (par défaut) et se désactive automatiquement dès que vous définissez `DATABASE_URL`.

Vous installez sur un Raspberry Pi, un vieux portable ou un petit VPS ? Consultez [Configurations à ressources limitées](/fr/guide/low-resource) pour un guide pas à pas adapté et pour savoir à quoi vous attendre sur du matériel limité.

Il vous sera demandé de changer votre mot de passe à la première connexion.

::: tip Analytique produit anonyme
SnapOtter inclut une analytique produit anonyme par défaut. Pour la désactiver, ouvrez **Settings → System → Privacy** et désactivez **Anonymous Product Analytics**. Cela s'arrête immédiatement pour toute l'instance.

Vous pouvez aussi définir la variable d'environnement `SNAPOTTER_TELEMETRY=0` (`false` et `off` fonctionnent aussi) pour désactiver toute la télémétrie de l'instance sans reconstruction.

La surveillance des erreurs est assurée par [Sentry](https://sentry.io), qui sponsorise SnapOtter via son programme open source.

Pour les détails sur ce qui est collecté, consultez [Ce que SnapOtter collecte](/fr/guide/telemetry).
:::

::: tip Accélération NVIDIA CUDA
Ajoutez `--gpus all` pour la suppression, la mise à l'échelle, l'amélioration du visage et la restauration accélérées par NVIDIA CUDA. OCR reste basé sur le CPU et fonctionne dans la même image avec ou sans accès GPU :

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Nécessite le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Revient automatiquement au CPU lorsque CUDA n'est pas disponible. L’accélération Intel/AMD iGPU via VA-API, Quick Sync ou OpenCL n’est aujourd’hui pas prise en charge pour l’inférence IA. Voir [Docker Tags](/fr/guide/docker-tags) pour les tests de performance. Si les outils d'IA s'exécutent sur le processeur malgré `--gpus all`, voir [Vérifier l'accélération GPU](/fr/guide/deployment#verify-gpu-acceleration).
:::

::: details Également sur GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Les deux registres publient la même image à chaque release.
:::

## Docker Composer {#docker-compose}

Utilisez le fichier de production maintenu et testé avec chaque version au lieu de copier un exemple Compose abrégé à partir de cette page :

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.1.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Le canonique [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.1.0/docker/docker-compose.yml) inclut les quatre volumes d'exécution, les vérifications de l'état, les limites de ressources, la configuration Redis durable, les images de base de données/cache épinglées et le renforcement actuel du conteneur. Modifiez le mot de passe administrateur par défaut immédiatement après la première connexion. Pour un déploiement reproductible, épinglez l’image de l’application SnapOtter à la balise de version ou au résumé que vous avez vérifié au lieu de suivre `latest`.

Voir [Configuration](/fr/guide/configuration) pour toutes les variables d'environnement et [Sécurité et renforcement](/fr/guide/security) pour les secrets, la politique réseau et les conseils de sauvegarde.

## Construire depuis les sources {#build-from-source}

**Prérequis :** Node.js 22.22+, pnpm 9+, Docker (pour Postgres + Redis), Python 3.11+ (pour les fonctionnalités IA), Git.

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

| Modalité | Nombre | Outils d'exemple |
|----------|-------|---------------|
| **Image** | 107 | Redimensionner, Rogner, Compresser, Convertir, Supprimer l'arrière-plan, Agrandir, OCR, Filigrane, Collage, Coloriser, Outils GIF, préréglages de format |
| **Vidéo** | 57 | Couper, Rogner, Compresser, Convertir, Fusionner, Extraire l'audio, Sous-titres automatiques, Vidéo vers GIF, Redimensionner, Stabiliser, préréglages de format |
| **Audio** | 27 | Couper, Fusionner, Convertir, Normaliser, Réduction du bruit, Transcrire, Décalage de hauteur, Fondu, Créateur de sonnerie, préréglages de format |
| **PDF / Document** | 29 | Fusionner, Diviser, Compresser, OCR, Filigrane, Caviarder, Word vers PDF, Excel vers PDF, Pivoter, Protéger, Réparer |
| **Fichiers** | 23 | CSV vers JSON, JSON vers XML, Fusionner des CSV, Diviser un CSV, Créer un ZIP, Extraire un ZIP, Créateur de graphiques, YAML/JSON |

### Pipelines {#pipelines}

Enchaînez des outils en flux de travail multi-étapes et appliquez-les à une image ou à un lot entier :

1. Ouvrez **Pipelines** dans la barre latérale.
2. Ajoutez des étapes (n'importe quel outil, n'importe quels paramètres).
3. Exécutez sur un seul fichier - ou sur un lot entier d'un coup.
4. Enregistrez le pipeline pour le réutiliser plus tard.

Les pipelines autorisent 20 étapes par défaut. Réglez `MAX_PIPELINE_STEPS=0` pour rendre la limite illimitée.

### Bibliothèque de fichiers {#file-library}

Chaque fichier que vous traitez peut être enregistré dans votre bibliothèque **Files**. SnapOtter suit l'historique complet des versions pour que vous puissiez retracer chaque étape de traitement, du téléversement d'origine jusqu'à la sortie finale.

L'enregistrement est explicite : les résultats que vous enregistrez dans la bibliothèque sont conservés jusqu'à ce que vous les supprimiez, tandis que les résultats que vous traitez et laissez non enregistrés sont effacés automatiquement après 72 heures (configurable via `FILE_MAX_AGE_HOURS`).

### API REST et clés API {#rest-api-api-keys}

Chaque outil est accessible via HTTP :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Générez des clés API sous **Settings → API Keys**. Consultez la [référence de l'API REST](/fr/api/rest) pour tous les points de terminaison, ou visitez [http://localhost:1349/api/docs](http://localhost:1349/api/docs) pour la référence interactive.

### Multi-utilisateur et équipes {#multi-user-teams}

Activez plusieurs utilisateurs avec un contrôle d'accès basé sur les rôles :

- **Admin** : accès complet - gérer les utilisateurs, les équipes, les paramètres, tous les fichiers/pipelines/clés API
- **User** : utiliser les outils, gérer ses propres fichiers/pipelines/clés API

Créez des équipes sous **Settings → Teams** pour regrouper les utilisateurs.

Réglez `AUTH_ENABLED=true` (ou `false` pour un usage mono-utilisateur/personnel sans connexion).
