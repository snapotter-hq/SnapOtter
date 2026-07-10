---
description: "Installez SnapOtter avec Docker en une seule commande. Comprend la configuration de Docker Compose, la compilation depuis les sources et un aperçu complet des fonctionnalités."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 072627745e5c
---

# Prise en main {#getting-started}

::: tip Essayez avant d'installer
Explorez l'interface complète sur [demo.snapotter.com](https://demo.snapotter.com) - aucune inscription ni installation requise.
:::

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ce conteneur unique exécute tout ce dont il a besoin : sans `DATABASE_URL` défini, il démarre son propre PostgreSQL et Redis sur l'interface de bouclage (mode embarqué) et conserve toutes les données dans le volume `SnapOtter-data`. C'est le moyen le plus rapide d'essayer SnapOtter ou de l'auto-héberger sur un homelab. Pour la production, exécutez la pile [Docker Compose](#docker-compose) ci-dessous, qui garde PostgreSQL et Redis dans leurs propres conteneurs. Le mode embarqué s'exécute en tant que root (le comportement par défaut) et se désactive automatiquement dès que vous définissez `DATABASE_URL`.

Il vous sera demandé de changer votre mot de passe lors de la première connexion.

::: tip Analyses de produit anonymes
SnapOtter inclut des analyses de produit anonymes par défaut. Pour les désactiver, ouvrez **Paramètres → Système → Confidentialité** et désactivez **Analyses de produit anonymes**. Elles s'arrêtent immédiatement pour toute l'instance.

Pour plus de détails sur ce qui est collecté, voir [Ce que SnapOtter collecte](/fr/guide/telemetry).
:::

::: tip Accélération NVIDIA CUDA
Ajoutez `--gpus all` pour une suppression d'arrière-plan, un agrandissement, un OCR, une amélioration de visage et une restauration accélérés par NVIDIA CUDA :

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Nécessite le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Bascule automatiquement sur le CPU lorsque CUDA n'est pas disponible. L'accélération des iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge aujourd'hui pour l'inférence IA. Voir [Tags Docker](/fr/guide/docker-tags) pour les benchmarks.
:::

::: details Également sur GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Les deux registres publient la même image à chaque version.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Voir [Configuration](/fr/guide/configuration) pour toutes les variables d'environnement.

## Compiler depuis les sources {#build-from-source}

**Prérequis :** Node.js 22+, pnpm 9+, Docker (pour Postgres + Redis), Python 3.10+ (pour les fonctionnalités d'IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend : [http://localhost:1349](http://localhost:1349)
- Backend : [http://localhost:13490](http://localhost:13490)

## Ce que vous pouvez faire {#what-you-can-do}

### Traitement de fichiers (241 outils) {#file-processing-241-tools}

| Modalité | Nombre | Exemples d'outils |
|----------|-------|---------------|
| **Image** | 105 | Redimensionner, Rogner, Compresser, Convertir, Supprimer l'arrière-plan, Agrandir, OCR, Filigrane, Collage, Coloriser, Outils GIF, préréglages de format |
| **Vidéo** | 57 | Découper, Rogner, Compresser, Convertir, Fusionner, Extraire l'audio, Sous-titres automatiques, Vidéo vers GIF, Redimensionner, Stabiliser, préréglages de format |
| **Audio** | 27 | Découper, Fusionner, Convertir, Normaliser, Réduction du bruit, Transcrire, Décalage de hauteur, Fondu, Créateur de sonnerie, préréglages de format |
| **PDF / Document** | 42 | Fusionner, Diviser, Compresser, OCR, Filigrane, Caviarder, Word vers PDF, Excel vers PDF, Pivoter, Protéger, Réparer |
| **Fichiers** | 10 | CSV vers JSON, JSON vers XML, Fusionner des CSV, Diviser un CSV, Créer un ZIP, Extraire un ZIP, Créateur de graphiques, YAML/JSON |

### Pipelines {#pipelines}

Enchaînez des outils en flux de travail à plusieurs étapes et appliquez-les à une seule image ou à un lot entier :

1. Ouvrez **Pipelines** dans la barre latérale.
2. Ajoutez des étapes (n'importe quel outil, n'importe quels paramètres).
3. Exécutez sur un seul fichier - ou sur un lot entier d'un coup.
4. Enregistrez le pipeline pour le réutiliser plus tard.

Les pipelines autorisent 20 étapes par défaut. Définissez `MAX_PIPELINE_STEPS=0` pour rendre la limite illimitée.

### Bibliothèque de fichiers {#file-library}

Chaque fichier que vous traitez peut être enregistré dans votre bibliothèque **Fichiers**. SnapOtter suit l'historique complet des versions afin que vous puissiez retracer chaque étape de traitement, de l'importation d'origine jusqu'au résultat final.

L'enregistrement est explicite : les résultats que vous enregistrez dans la bibliothèque sont conservés jusqu'à ce que vous les supprimiez, tandis que les résultats que vous traitez et laissez non enregistrés sont effacés automatiquement au bout de 72 heures (configurable via `FILE_MAX_AGE_HOURS`).

### API REST et clés d'API {#rest-api-api-keys}

Chaque outil est accessible via HTTP :

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Générez des clés d'API dans **Paramètres → Clés d'API**. Voir la [référence de l'API REST](/fr/api/rest) pour tous les points de terminaison, ou visitez [http://localhost:1349/api/docs](http://localhost:1349/api/docs) pour la référence interactive.

### Multi-utilisateur et équipes {#multi-user-teams}

Activez plusieurs utilisateurs avec un contrôle d'accès basé sur les rôles :

- **Admin** : accès complet - gérer les utilisateurs, les équipes, les paramètres, tous les fichiers/pipelines/clés d'API
- **Utilisateur** : utiliser les outils, gérer ses propres fichiers/pipelines/clés d'API

Créez des équipes dans **Paramètres → Équipes** pour regrouper les utilisateurs.

Définissez `AUTH_ENABLED=true` (ou `false` pour un usage mono-utilisateur/personnel sans connexion).
