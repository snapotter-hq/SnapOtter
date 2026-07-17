---
description: "Installez SnapOtter avec Docker en une seule commande. Inclut la configuration Docker Compose, la construction depuis les sources et un aperçu complet des fonctionnalités."
i18n_output_hash: 2c2f3f2e8ae1
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Prise en main {#getting-started}

::: tip Essayez avant d'installer
Explorez l'interface complète sur [demo.snapotter.com](https://demo.snapotter.com) - aucune inscription ni installation requise.
:::

## Démarrage rapide {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ce conteneur unique exécute tout ce dont il a besoin : sans `DATABASE_URL` défini, il démarre ses propres PostgreSQL et Redis sur l'interface de bouclage (mode embarqué) et conserve toutes les données dans le volume `SnapOtter-data`. C'est le moyen le plus rapide d'essayer SnapOtter ou de l'auto-héberger sur un homelab. Pour la production, exécutez la pile [Docker Compose](#docker-compose) ci-dessous, qui garde PostgreSQL et Redis dans leurs propres conteneurs. Le mode embarqué s'exécute en root (le défaut) et se désactive automatiquement dès que vous définissez `DATABASE_URL`.

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

Nécessite le [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Se replie automatiquement sur le CPU lorsque CUDA n'est pas disponible. L'accélération par iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL n'est pas prise en charge pour l'inférence IA aujourd'hui. Consultez [Tags Docker](/fr/guide/docker-tags) pour les tests de performance.
:::

::: details Également sur GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Les deux registres publient la même image à chaque release.
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

Consultez [Configuration](/fr/guide/configuration) pour toutes les variables d'environnement.

## Construire depuis les sources {#build-from-source}

**Prérequis :** Node.js 22+, pnpm 9+, Docker (pour Postgres + Redis), Python 3.10+ (pour les fonctionnalités IA), Git.

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

### Traitement de fichiers (200+ outils) {#file-processing-200-tools}

| Modalité | Nombre | Outils d'exemple |
|----------|-------|---------------|
| **Image** | 105 | Redimensionner, Rogner, Compresser, Convertir, Supprimer l'arrière-plan, Agrandir, OCR, Filigrane, Collage, Coloriser, Outils GIF, préréglages de format |
| **Vidéo** | 57 | Couper, Rogner, Compresser, Convertir, Fusionner, Extraire l'audio, Sous-titres automatiques, Vidéo vers GIF, Redimensionner, Stabiliser, préréglages de format |
| **Audio** | 27 | Couper, Fusionner, Convertir, Normaliser, Réduction du bruit, Transcrire, Décalage de hauteur, Fondu, Créateur de sonnerie, préréglages de format |
| **PDF / Document** | 42 | Fusionner, Diviser, Compresser, OCR, Filigrane, Caviarder, Word vers PDF, Excel vers PDF, Pivoter, Protéger, Réparer |
| **Fichiers** | 10 | CSV vers JSON, JSON vers XML, Fusionner des CSV, Diviser un CSV, Créer un ZIP, Extraire un ZIP, Créateur de graphiques, YAML/JSON |

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
