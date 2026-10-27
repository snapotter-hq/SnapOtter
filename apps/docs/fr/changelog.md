---
description: "Notes de version et historique des versions de SnapOtter. Découvrez les nouveautés, les améliorations et les correctifs de chaque version."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: eea7d08bc967
---

# Journal des modifications {#changelog}

## v2.2.0 {#v2-2-0}

L'essentiel de la 2.2 relève du durcissement. Un non-administrateur disposant d'un rôle `users:manage` délégué pouvait prendre le contrôle d'une instance, et tous les points de terminaison d'outils s'avéraient dépourvus de leur vérification de permission. Mettez à niveau si vous avez plus d'un utilisateur.

Le reste, c'est la longue traîne de l'auto-hébergement : des téléchargements qui démarraient et ne se terminaient jamais, des préréglages qui cassaient dès l'ajout d'un second fichier, des conteneurs qui bouclaient sur un plantage pendant que Postgres démarrait encore. Deux nouveaux outils ont aussi fait leur apparition. La documentation et le site web sont désormais traduits en 21 langues, et l'interface respecte enfin les contrastes WCAG AA.

> [!IMPORTANT]
> Si vous avez accordé `users:manage` à un non-administrateur via un rôle personnalisé, ce rôle pouvait prendre le contrôle de comptes administrateurs sur les versions 2.0.0 à 2.1.0. Détails dans la section Sécurité.

### Sécurité {#v2-2-0-security}

- **Élévation de privilèges via un rôle `users:manage` délégué (GHSA-9xgh-95qh-2x7h).** Un non-administrateur disposant de `users:manage` via un rôle personnalisé pouvait réinitialiser le mot de passe d'un compte plus privilégié, ou le supprimer, y compris un administrateur intégré, et prendre le contrôle de l'instance. La réinitialisation de mot de passe et la suppression de compte vérifient désormais l'autorité de l'appelant sur la cible, de sorte qu'un rôle délégué ne peut pas agir au-delà de son propre niveau. Concerné : 2.0.0 à 2.1.0. Signalé par 李春来 (Chunlai Li). (#616)
- **Chaque point de terminaison d'outil est désormais protégé.** L'accès aux outils était appliqué route par route, si bien que les 45 routes écrites à la main devaient toutes se souvenir du même appel, et aucune ne le faisait. Un rôle dépourvu de `tools:use` pouvait encore exécuter image-to-pdf, erase-object, upscale, sign-pdf et les autres. La vérification réside maintenant dans un unique preHandler indexé sur la route correspondante, ce qui couvre les sous-chemins et toute route ajoutée par la suite. (#646)
- **La limitation de débit était contournable sur les installations Docker.** L'image livrait `TRUST_PROXY=true`, l'IP cliente provenait donc d'un en-tête de requête et un `X-Forwarded-For` falsifié franchissait le limiteur de connexion. La valeur par défaut est désormais une liste de réseaux privés de confiance. (#649)
- **Les écritures de paramètres sont vérifiées paramètre par paramètre**, et non une fois à l'entrée, et l'importation de configuration est désormais transactionnelle afin qu'une clé rejetée ne laisse pas une configuration à moitié appliquée. (#618)
- **Les noms de fichiers de la bibliothèque ne peuvent pas sortir de leur racine de stockage.** Un nom stocké fabriqué, qu'un import SQLite 1.x malveillant recopie tel quel, pouvait lire ou supprimer des fichiers en dehors du répertoire des fichiers. Accessible uniquement après qu'un opérateur a importé une base SQLite 1.x fournie par un attaquant, seul chemin qui permet de choisir un nom stocké. Signalé par @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **L'annulation de tâche applique la propriété**, un utilisateur authentifié ne peut donc plus annuler la tâche d'un autre utilisateur par son identifiant. Signalé par @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **Un nouvel audit de toute l'arborescence 2.0 a révélé ce qui restait ouvert** : une assertion SAML capturée pouvait être rejouée, un défi MFA survivait à n'importe quel nombre de codes erronés, la recherche de clé d'API à chaque requête était un balayage complet de table, `MAX_WORKSPACE_SIZE_GB` était une configuration morte, et l'assainisseur SVG laissait passer des href `javascript:` sans guillemets. (#620)
- **Neuf CVE divulguées corrigées** : fast-uri, svgo, sharp et tar de manière transitive (#619), plus Pillow 12.3.0 (#517). Le décodage RAW sur arm64 compile désormais LibRaw 0.22.2 depuis les sources au lieu de lier une copie système non corrigée. (#649)

### Nouvelles fonctionnalités {#v2-2-0-new-features}

- **Recadrage arrondi** : masques en carré arrondi et en squircle façon iOS, avec un réglage du rayon des coins. Pensé pour les favicons et les icônes d'application. (#602)
- **Supprimer l'arrière-plan d'un GIF** : retirez l'arrière-plan d'un GIF animé, d'un WebP ou d'un APNG image par image et récupérez une animation transparente. (#502)
- **Lasso et mode haute qualité pour l'effaceur d'objets** : tracez une boucle libre au lieu de peindre chaque pixel, et installez en option un bundle de remplissage par diffusion pour des remplissages plus propres sur de grandes zones. (#503, #566)
- **Enregistrer comme nouveau fichier, ou remplacer.** Modifier un fichier de la bibliothèque remplaçait auparavant silencieusement l'original. Vous choisissez désormais à chaque modification, et l'option par défaut conserve l'original. (#564, #577)
- **Préréglages de rapport d'aspect dans l'outil Redimensionner.** Choisissez 1:1, 4:3 ou 16:9 et les deux dimensions restent verrouillées, sans agrandissement. (#530)
- **OCR à deux niveaux** : un niveau rapide intégré à l'image qui fonctionne hors ligne sans téléchargement, et un moteur plus précis qui s'installe à la demande. (#519)
- **Tapez n'importe où pour rechercher.** Commencez à écrire sur le tableau de bord ou la page d'accueil et votre saisie apparaît dans le champ de recherche. (#644)
- **Documentation et site web en 21 langues** : le site de documentation, les pages d'accueil et la référence API sont désormais tous traduits, comme l'interface de l'application. Un nouveau guide de déploiement pour ressources limitées couvre Raspberry Pi et les machines à 2 Go. (#548)
- **Noms d'outils plus clairs** : 18 noms ambigus précisent désormais leur objet, si bien que « Compress » devient « Compress Image ». Les identifiants et les routes des outils sont inchangés, donc aucun favori ne casse. (#520)

### Améliorations {#v2-2-0-improvements}

- **Contrastes WCAG AA dans toute l'interface** : la palette a été réaccordée pour que l'orange vif reste sur les remplissages tandis que le texte et les libellés utilisent des jetons d'encre accessibles, et les 57 indicateurs de focus franchissent désormais le seuil de 3:1 pour les éléments non textuels. (#567, #574)
- **Agrandissement et suppression d'arrière-plan ne semblent plus figés** : la barre de progression avance pendant l'inférence au lieu de rester bloquée à 30 %, et les deux outils préviennent désormais qu'un hôte sans GPU est bien plus lent. (#605, #608)
- **Les messages d'expiration nomment la vraie cause** et tiennent compte des hôtes CPU uniquement au lieu de blâmer le téléversement. (#596)
- **SnapOtter attend Postgres et Redis au démarrage** au lieu de boucler sur un plantage, aussi bien dans Compose que dans l'image tout-en-un. Une installation Proxmox LXC redémarrait 76 fois avant cela. (#537, #595)
- **Les téléchargements survivent à un reverse proxy** : SnapOtter demande à nginx et aux proxys compatibles de ne pas mettre en mémoire tampon les réponses de fichiers, ce qui est la raison habituelle d'un téléchargement auto-hébergé qui démarre et ne se termine jamais. (#604, #607)
- **La compression de PDF s'approche de la taille cible**, et le dit honnêtement quand une cible est hors de portée. (#522)
- **Les commandes des outils restent accessibles sur mobile** maintenant que les enveloppes de l'application se dimensionnent selon la fenêtre d'affichage dynamique. (#559)
- **La conversion audio expose désormais un réglage de fréquence d'échantillonnage.** (#561)
- **Les administrateurs peuvent assouplir la longueur minimale du mot de passe**, jusqu'à 1 pour une instance sur réseau local de confiance. (#543)
- **La MFA est en libre-service**, le verrouillage de la politique est corrigé, et les connexions OIDC ou SAML obtiennent un vrai défi MFA au lieu d'un blocage net. (#531, #536)
- **Un simple `Error: Error` nomme désormais sa cause.** Les échecs d'encodage Sharp, les sorties du sidecar IA, la sortie non JSON du sidecar de documents et les échecs de suppression d'arrière-plan arrivaient tous avec la raison effacée. (#532, #534, #535, #538, #612)
- **La boîte de dialogue d'aide est traduite.** Ses libellés de raccourcis et son texte de prise en main étaient codés en dur en anglais alors que des traductions terminées dormaient inutilisées dans les 21 fichiers de langue. (#647)

### Corrections de bogues {#v2-2-0-bug-fixes}

- **Les fichiers HEIC d'iPhone étaient rejetés** comme illisibles avant d'atteindre le décodeur qui les gère. (#631)
- **Les préréglages de conversion échouaient sur un second fichier** : jpg-to-pdf et ses équivalents image-to-pdf, plus pdf-to-png, pdf-to-jpg et pdf-to-tiff, renvoyaient tous `Tool not found` dès que vous téléversiez deux fichiers. (#633, #643)
- **Les préréglages de conversion PDF perdaient leur bouton de téléchargement.** (#629)
- **Un délai de traitement illimité n'était pas respecté**, et les flux de progression bloqués se rétablissent désormais au lieu de laisser l'interface en attente. (#638)
- **Les téléchargements restaient suspendus au lieu d'échouer** quand un fichier stocké s'avérait plus court que sa longueur enregistrée. (#617)
- **Les outils de pages PDF échouaient sur les fichiers courts et chiffrés** : Supprimer des pages partait par défaut sur une plage qui n'existe dans aucun document de moins de six pages, et les PDF protégés par mot de passe échouaient avec un message obscur dans le worker. (#594)
- **PDF vers texte renvoyait silencieusement un fichier vide** pour les PDF numérisés. L'outil vous oriente désormais vers l'OCR et sert le texte en UTF-8. (#603)
- **PDF vers Word perdait les blocs de texte colorés** et les découpait sur la page. (#500)
- **L'effaceur d'objets laissait des rémanences fantômes** et floutait les petits objets dans les images haute résolution. (#501)
- **La stabilisation vidéo produisait une sortie illisible** sans faststart. (#593)
- **Réparations de l'éditeur d'images** : rotation, miroir, redimensionnement, niveaux, courbes, filtres et verrouillage des calques. (#597)
- **Signer un PDF affichait un canevas vide** au lieu d'indiquer pourquoi un PDF n'avait pas pu être chargé. (#545)
- **La bibliothèque de fichiers enregistrait des dimensions 0x0** et sautait les aperçus des téléversements HEIC, RAW et PSD. (#636, #637)
- **L'installation de plusieurs bundles d'IA** laissait le virtualenv partagé en versions multiples et cassait discrètement trois outils. (#649)
- **La conversion en JXL aux qualités 1 à 4 renvoyait une erreur 500**, et un ffmpeg manquant vous était signalé comme un téléversement corrompu. (#649)
- **Une panne Postgres passagère laissait les tâches terminées en suspens**, avec leur sortie sur le disque et aucune ligne pointant vers elle. Un réconciliateur reprend désormais ce travail au lieu de l'abandonner. (#649)
- **Un point de terminaison Redis qui changeait d'adresse bloquait tous les consommateurs** alors que les vérifications d'état répondaient toujours 200. (#649)
- **Correctifs du site web et de la documentation** : les liens localisés ne perdent plus les fragments `#` ni ne passent `zh-CN` en minuscules, la navigation de la documentation reste dans la fenêtre d'affichage sur tablette, et aucun des deux sites n'appelle plus l'API GitHub depuis votre navigateur. (#516, #562, #570, #560)

### Notes de mise à niveau {#v2-2-0-upgrade-notes}

Rien à migrer, mais deux valeurs par défaut livrées ont changé :

- **`TRUST_PROXY` vaut désormais `loopback,linklocal,uniquelocal`** au lieu de faire confiance à tous les pairs. Les réseaux Docker bridge et Compose se situent dans cette plage, la plupart des installations n'ont donc rien à changer. Si votre reverse proxy atteint SnapOtter depuis une adresse publique, définissez `TRUST_PROXY` explicitement, sinon la limitation de débit et les journaux d'audit attribueront chaque requête au proxy.
- **`MAX_AI_JOBS_PER_USER` est fixé à 5** tâches IA mono-fichier simultanées par utilisateur. Les exécutions IA par lots et par pipeline restent sans plafond.

Nouveaux réglages facultatifs : `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (désactivé par défaut) et `GIF_BG_MAX_FRAMES`.

### Remerciements {#v2-2-0-acknowledgements}

Une bonne partie de cette version a commencé comme le rapport de bogue de quelqu'un d'autre.

Code et contributions :

- **@mvanhorn** ❤️ : a réécrit l'échec d'expiration de la suppression d'arrière-plan en un message qui dit quoi faire, au lieu d'une simple expiration. (#518, #494)
- **@EuanTop** ❤️ : a restauré l'action de téléchargement sur les pages des préréglages de conversion PDF en faisant renvoyer le contrat de résultat d'outil standard à la route synchrone. (#629, #623)
- **@harshjainnn** ❤️ : a diagnostiqué le téléchargement qui démarre et ne se termine jamais, et proposé la piste de la réinitialisation de socket sur laquelle le correctif a été bâti. (#617, #590)

Divulgations de sécurité :

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)) : a divulgué en privé l'élévation de privilèges via un rôle `users:manage` délégué, avec une analyse complète de la source au puits et une chaîne d'exploitation fonctionnelle. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar) : a divulgué un IDOR authentifié sur l'annulation de tâche, et une traversée de répertoire dans les noms de fichiers stockés de la bibliothèque, atteignable après un import SQLite 1.x malveillant, avec une preuve de concept fonctionnelle pour chacun. (#599, #600)

Rapports de bogues :

- **@riz467** ❤️ : de vrais fichiers HEIC d'iPhone rejetés à la validation, avec la cause racine identifiée dans le rapport. (#622)
- **@coupej** ❤️ : des pages de préréglages PDF bloquées indéfiniment, et jpg-to-pdf qui échouait dès l'ajout d'un second fichier. Deux bogues distincts, correctement séparés. (#623, #627)
- **@linuxuser1** ❤️ : `PROCESSING_TIMEOUT_S=0` documenté comme illimité mais plafonné à cinq minutes. (#630)
- **@bezibaerchen** ❤️ : la conversion audio masquait le réglage de fréquence d'échantillonnage que sa propre description promettait. (#558)
- **@hell-toupee** ❤️ : le bundle OCR précis qui échouait à s'installer avec une erreur `libpaddle`. (#505)
- **@Michael1260** ❤️ et **@And-CSH** ❤️ : ont confirmé indépendamment l'échec d'installation de l'OCR et établi que l'extraction manuelle fonctionne alors que le programme d'installation intégré ne fonctionne pas, ce qui a circonscrit le bogue au programme d'installation. (#505)
- **@TomErnst1972** ❤️ : l'activation de la politique exigeant la MFA enfermait un administrateur hors de sa propre instance. (#515)
- **@thokich** ❤️ : l'effacement d'objets produisait des remplissages flous et inutilisables, ce qui a motivé à la fois la réécriture du remplissage HD et le bundle haute qualité facultatif. (#141)
- **@Hennie-git** ❤️ : une installation Proxmox LXC redémarrant 76 fois contre un Postgres qui n'acceptait pas encore les connexions. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts) : a qualifié ce rapport en temps réel et produit le diagnostic sur lequel le correctif de démarrage a été bâti. (#537)

Demandes de fonctionnalités et retours :

- **@LECOQQ** ❤️ : a demandé d'assouplir la complexité des mots de passe sur une installation de serveur domestique. (#136)
- **@killervette42** ❤️ : a demandé une application communautaire Unraid, désormais publiée sur le magasin Unraid CA. (#96)
- **@alienatedsec** ❤️ : a signalé que le correctif de retour au CPU en cas d'échec GPU était enfoui dans un ticket fermé et introuvable, ce qui explique qu'il figure désormais dans la documentation de déploiement. (#490, #587)
- **@neilp316** ❤️ : a confirmé l'échec GPU Blackwell sur une RTX 5060 et tracé un chemin de mise à niveau CUDA 12.8 fonctionnel. (#120)
- **@Roiki11** ❤️ : a plaidé pour un stockage partagé avec des références de chemins plutôt qu'un transfert de fichiers HTTP pour le calcul IA hors machine. (#189)

Merci également aux membres de la communauté qui ont signalé ces points sur Discord et par e-mail, et dont nous n'avons pas noté les noms : la demande de recadrage en squircle (#602), le téléchargement image-to-PDF qui démarrait et ne se terminait jamais (#604, #607), l'outil Supprimer des pages qui se bloquait (#594), le texte arabe absent de pdf-to-text (#603), et le diagnostic derrière le retour au CPU d'ONNX (#490).

[Diff complet sur GitHub](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
