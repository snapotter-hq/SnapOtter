---
description: "Notes de version et historique des versions de SnapOtter. Découvrez les nouveautés, les améliorations et les correctifs de chaque version."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 5d63753731ab
---

# Journal des modifications {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 transforme la boîte à outils d'images en une suite complète de manipulation de fichiers : plus de 200 outils répartis sur cinq modalités (Image, Vidéo, Audio, PDF et Fichiers), reconstruite sur Postgres 17 et une file d'attente de tâches basée sur Redis, avec un `docker run` en une seule commande. Il s'agit d'une version majeure ; lisez les Changements incompatibles avant de mettre à niveau depuis la version 1.x.

### Nouvelles fonctionnalités {#new-features}

- **Quatre nouvelles modalités d'outils** : Vidéo, Audio, PDF et Fichiers rejoignent Image, portant le catalogue à plus de 200 outils.
- **Tâches d'arrière-plan durables** : une file d'attente basée sur Redis (BullMQ) exécute chaque outil comme une tâche suivie avec une progression SSE en direct.
- **Mode conteneur unique tout-en-un** : une seule commande `docker run` démarre une instance complète avec Postgres et Redis intégrés.
- **Modules d'IA à la demande** : suppression d'arrière-plan, OCR, transcription, agrandissement, détection et amélioration des visages, gomme d'objets, colorisation et restauration de photos s'installent depuis l'interface. L'accélération GPU est détectée par framework.
- **Signer un PDF** : dessinez, saisissez ou téléversez une signature et placez-la sur un PDF dans le navigateur.
- **Automatiser** : un constructeur visuel de pipelines qui enchaîne les outils, avec neuf modèles préconçus.
- **83 préréglages de conversion en un clic** : convertisseurs dédiés JPG vers PNG, MP4 vers GIF et similaires avec recherche approximative.
- **Éditeur d'images par calques** : un éditeur propulsé par Konva à `/editor` avec pinceaux, formes, ajustements, filtres et courbes.
- **Bibliothèque de fichiers** : enregistrez n'importe quel résultat et réutilisez-le comme entrée d'un autre outil.
- Outils épinglés, zoom et déplacement dans le canevas, 21 langues et fonctionnalités d'entreprise (OIDC/SSO, SAML, SCIM, stockage S3, permissions par outil, export d'audit, traçage distribué).

### Améliorations {#improvements}

- Annulation d'un traitement en cours. (#137)
- Décodage RAW en pleine résolution via LibRaw, y compris DNG. (#289)
- Déploiements non-root et à UID étranger (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Détection précise des installations d'IA et flux d'installation renforcé. (#214, #352)
- Renforcement de la confidentialité : aucune sortie automatique vers des tiers, plus un mode strictement hors ligne facultatif.
- Bouton de retour toujours disponible, même lorsque l'analytique est désactivée.

### Corrections de bogues {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` désactive de nouveau la limitation de débit pour les routes d'outils. (#271)
- Correction des chemins de l'environnement virtuel d'IA dans l'image Docker. (#390)
- Compatibilité avec sharp 0.35.2+. (#362)
- Corrections de la mise en page de l'éditeur d'images : règles, comportement de remplissage, barre latérale et dimensionnement du canevas. (#258, #259)
- Traduction italienne terminée. (#231, #206, #425)
- La normalisation audio et loudnorm préservent la fréquence d'échantillonnage source.
- Renforcement contre le SSRF : correspondance CIDR IPv6 numérique et pré-analyse d'URL élargie. (#287)
- Les PDF générés portent SnapOtter comme Producer.
- mediapipe s'installe sur Python 3.13 et Debian 13.

### Changements incompatibles {#breaking-changes}

2.0 remplace la base de données SQLite intégrée par Postgres 17 et ajoute Redis 8 pour la file d'attente de tâches. Vos données 1.x sont migrées automatiquement au premier démarrage, mais la pile de conteneurs a changé, alors sauvegardez d'abord l'intégralité de votre volume `/data` (la version 1.x exécute SQLite en mode WAL, si bien que les données validées se trouvent généralement dans `snapotter.db-wal`). Choisissez ensuite l'image à conteneur unique (Postgres et Redis intégrés, root uniquement) ou la pile Compose (application plus Postgres 17 et Redis 8). Consultez le [guide de migration](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) et le [guide de mise à niveau](/fr/guide/upgrading).

### Mise à niveau {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Nouvel outil HTML vers Image, accessibilité WCAG 2.2 AA, renforcement de la sécurité issu de tests d'intrusion, et 5 correctifs Docker critiques.

### Nouvelles fonctionnalités {#new-features-1}

- **HTML vers Image** : capturez des captures d'écran d'URL ou de HTML brut en PNG/JPEG/WebP. Captures de page entière, viewports personnalisés, mode sombre.
- **Convention de secret Docker _FILE** : montez les variables d'environnement sensibles sous forme de fichiers plutôt qu'en texte clair. (#205)
- **Licences d'entreprise et stockage S3** : clé de licence commerciale facultative et stockage d'objets compatible S3.
- **Améliorations de l'éditeur de formes** : transparence de remplissage/contour, sélecteur de couleur RGBA, styles de traits en pointillés.
- **Archives de version préconstruites** : téléchargez des tarballs depuis GitHub Releases pour les installations hors Docker (Proxmox, matériel dédié, LXC). (#202)

### Améliorations {#improvements-1}

- **Accessibilité WCAG 2.2 AA** : saut de navigation, piégeage du focus, régions aria-live, prise en charge du mouvement réduit, rapports de contraste corrects. (#209)
- **Réactivité mobile** : paramètres réactifs, reconnexion automatique SSE lors du changement d'onglet mobile. (#203, #204)
- **Qualité de la suppression d'arrière-plan** : lissage des contours, décontamination des couleurs, sélection du format de sortie.
- **Traduction italienne** : environ 145 nouvelles chaînes par @albanobattistella. (#206)
- **Documentation de l'API par outil** : 53 pages de documentation avec paramètres, exemples et formats de réponse.
- **Téléchargements de modèles d'IA** : logique de nouvelle tentative avec repli exponentiel pour HuggingFace. (#201)

### Corrections de bogues {#bug-fixes-1}

- Les conteneurs Docker frais étaient totalement inutilisables (la limitation de débit bloquait toutes les requêtes).
- Les outils d'IA de détection de visage (blur-faces, red-eye-removal, enhance-faces, passport-photo) échouaient sur toutes les plateformes.
- Fichiers HEIC cassés sur ARM (incompatibilité de symboles libheif).
- Les modules d'IA d'agrandissement et de restore-photo ne s'installaient pas sur ARM.
- L'OCR utilisait la mauvaise version de CUDA sur les conteneurs GPU.
- Contournement de la protection SSRF via des adresses IPv6 mappées en IPv4 hexadécimales. (Crédit : @tonghuaroot)
- Décodage HEIC de l'iPhone avec images auxiliaires. (#183, #199)
- OOM CUDA de Real-ESRGAN sur les GPU de 8 Go. (#200)
- 6 erreurs Sentry en production et 7 bogues d'AQ. (#208)

### Sécurité {#security}

- 10 constats de test d'intrusion corrigés (contournement XFF, plantages sur JSON malformé, pipelines non bornés, XSS du journal d'audit, méthode TRACE, et plus). (#207)
- Contournement SSRF via IPv6 hexadécimal bloqué. (Crédit : @tonghuaroot)
- Images de base du Dockerfile épinglées par empreinte.

### Mise à niveau {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Démo en direct, pages de destination par outil, et un lot de correctifs de finition.

### Nouvelles fonctionnalités {#new-features-2}

- **Démo en direct** - [demo.snapotter.com](https://demo.snapotter.com) permet d'essayer SnapOtter sans rien installer.
- **Page d'index des outils** - Parcourez les plus de 50 outils à `/tools` avec recherche et filtres par catégorie.
- **Plus de 50 pages de destination SEO** - Chaque outil dispose désormais d'une page de destination dédiée avec FAQ, cas d'usage et tableaux comparatifs.
- **Aperçu de l'arrière-plan** - Un curseur avant-après affiche un arrière-plan à damier derrière les images transparentes.
- **Générateur de mots de passe forts** - Bouton en un clic dans le formulaire d'ajout de membres.

### Corrections de bogues {#bug-fixes-2}

- L'outil d'infos HEIC/HEIF n'échoue plus (pré-décodage ajouté).
- L'installation des modules de modèles d'IA affiche de meilleurs messages d'erreur et respecte les limites de ressources.
- Les vignettes de la bibliothèque se chargent correctement (les en-têtes d'authentification manquaient).
- Les menus déroulants ne sont plus tronqués dans les tableaux des paramètres Personnes et Équipes.
- Pourcentage de comparaison de taille masqué sur les outils sans compression.
- Lien en double vers la politique de confidentialité supprimé.
- Traduction italienne ajoutée pour les paramètres des fonctionnalités d'IA.
- Icônes Lucide renommées mises à jour (Wand2, Columns).

### Infrastructure {#infrastructure}

- OpenSSF Scorecard renforcé de 4,3 à environ 7,0.
- Tests CI parallélisés en 4 fragments avec des fixtures réduites.
- 41 mises à jour de dépendances.

### Mise à niveau {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Cinq nouveaux outils, un éditeur d'images complet, connexion SSO, 20 langues. Cela aurait probablement dû faire l'objet de trois versions distinctes, mais voilà.

### Nouvelles fonctionnalités {#new-features-3}

- **Éditeur d'images** - Calques, pinceaux, formes, ajustements, filtres, courbes, raccourcis clavier. S'exécute dans votre navigateur, traite sur votre matériel.
- **Authentification OIDC / SSO** - Connexion avec Google, GitHub, Okta ou tout fournisseur OpenID Connect. Définissez quelques variables d'environnement et votre équipe utilise ses comptes existants.
- **Générateur de mèmes** - 100 modèles intégrés avec rendu de texte via opentype.js. Ou téléversez votre propre image.
- **Embellir** - Déposez une capture d'écran, obtenez une image soignée. Cadres d'appareils (macOS, Windows, navigateur), ombres, dégradés, préréglages pour les réseaux sociaux.
- **Simulation du daltonisme** - Prévisualisez le rendu des images avec la protanopie, la deutéranopie, la tritanopie et d'autres déficiences de la vision des couleurs.
- **Correcteur de transparence PNG** - Détecte les PNG à fausse transparence et les corrige avec le matting HR BiRefNet. Suppression de filigrane facultative via l'inpainting LaMa.
- **Extension de canevas par IA** - Étendez les limites de l'image avec un remplissage par IA. Trois niveaux de qualité (rapide, équilibré, qualité) selon le temps GPU que vous voulez y consacrer.
- **20 langues** - Arabe, chinois (simplifié/traditionnel), tchèque, néerlandais, français, allemand, hindi, indonésien, italien, japonais, coréen, polonais, portugais, russe, espagnol, thaï, turc, ukrainien, vietnamien. Le RTL fonctionne pour l'arabe.
- **Import d'URL** - Collez des URL dans la zone de dépôt ou importez-les en masse à partir d'une liste. Récupération côté serveur avec protection SSRF.
- **Gomme multi-fichiers** - Dessinez des masques d'effacement sur plusieurs images, traitez-les toutes en un clic. Les traits persistent par image.
- **Import/export de pipelines** - Enregistrez les chaînes d'outils au format JSON, partagez-les avec d'autres.
- **17 nouveaux formats RAW d'appareil photo** via exiftool, plus les entrées QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ et APNG. Nouveaux codecs de sortie pour BMP, ICO, JP2, QOI. Export AVIF, TIFF, GIF, JXL et PSD récupéré d'une branche précédemment perdue.

### Améliorations {#improvements-2}

- **Amélioration d'image** - Remplacement de l'ancien pipeline par CLAHE + normalise + gamma. La nouvelle bascule Deep Enhance utilise le modèle d'IA pour des résultats plus agressifs.
- **Restauration de photo** - Détection des rayures réécrite avec un filtrage Otsu à 8 angles. L'inpainting LaMa s'exécute désormais à la résolution native.
- **Formats exotiques partout** - OCR, image-vers-PDF, générateur de favicon, composition, assemblage et vectorisation décodent tous désormais HEIC, RAW et PSD.
- **Compresser** - Tolérance de taille cible resserrée de 5 % à 1 %. La taille cible est le mode par défaut. Ajout de boutons pas à pas et d'un sélecteur d'unité Ko/Mo.
- **Nettoyage de Sentry** - 644 événements non exploitables filtrés. Les vraies erreurs sont désormais correctement gérées.
- **Détection GPU** - Meilleurs diagnostics pour les conteneurs où CUDA est présent mais nvidia-smi absent.
- **Mode authentification désactivée** - Un utilisateur anonyme est initialisé dans la base de données avec le rôle admin. Les clés d'API, les pipelines et les fichiers utilisateur ne cassent plus sur les contraintes de clé étrangère.
- **Plus de 2 705 nouveaux tests** couvrant l'unitaire, l'intégration et l'E2E.

### Corrections de bogues {#bug-fixes-3}

- L'agrandissement sur CPU n'expire plus sur les NAS et le matériel de faible puissance.
- Le logo du code QR ne fait plus disparaître définitivement l'aperçu.
- Débordement de rognage corrigé pour les images portrait hautes.
- Les fichiers TIFF avec alpha forcent correctement la sortie PNG au lieu de produire une corruption.
- Le décodage HDR/EXR convertit en 8 bits avant CLAHE, corrigeant les échecs de décodage.
- Les tampons d'entrée des points de repère du visage sont convertis en PNG avant le sidecar Python, corrigeant les plantages.
- La recherche de doublons gère les lots à formats mixtes et les erreurs réseau.
- L'aperçu d'Embellir se met à jour en temps réel.
- Barres de progression pour l'assemblage et la vectorisation.
- SVGZ géré par SVG-vers-raster.
- Noms de fichiers non-ASCII corrigés via l'en-tête X-File-Results encodé en pourcentage.

### Mise à niveau {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Ou avec Docker Compose :

```bash
docker compose pull && docker compose up -d
```

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

Image Docker unifiée avec détection automatique du GPU. Une seule image gère les charges de travail CPU et GPU. Compose simplifié en un seul fichier avec rotation des journaux. Les pré-téléchargements de modèles incluent désormais une vérification et un test de fumée.

---

## v1.13.0 {#v1-13-0}

Contrôle d'accès basé sur les rôles (RBAC). 14 permissions granulaires, trois rôles intégrés (admin, editor, user), prise en charge des rôles personnalisés. Vérifications de permissions sur toutes les routes de l'API. Onglets du frontend filtrés selon les permissions de l'utilisateur.

---

## v1.12.0 {#v1-12-0}

Outil PDF vers Image. Convertissez les pages PDF en PNG, JPEG, WebP ou TIFF au DPI de votre choix. Image Docker unifiée avec détection automatique du GPU.

---

## v1.11.0 {#v1-11-0}

llms.txt auto-généré via vitepress-plugin-llms pour une documentation adaptée à l'IA.

---

## v1.10.0 {#v1-10-0}

Redimensionnement adaptatif au contenu (seam carving) avec protection des visages. Redimensionnez les images tout en préservant le contenu important.

---

## v1.9.0 {#v1-9-0}

Outil Assembler / Combiner. Joignez des images côte à côte, empilées verticalement ou dans une grille personnalisée.

---

## v1.8.0 {#v1-8-0}

Outil de modification des métadonnées. Consultez et modifiez les métadonnées EXIF, IPTC et XMP avec une interface granulaire de suppression/conservation.

---

## Versions plus anciennes {#older-releases}

Pour le journal des modifications complet au niveau des commits, y compris les versions correctives, consultez [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases).
