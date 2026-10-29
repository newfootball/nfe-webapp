# Environnements Appwrite — #46

État : **preuve locale complète réussie ; préparation distante partielle**.
Les cinq contrôles réels couvrent santé serveur Bun, connexion navigateur avec
cookies, capture SMTP Auth, refus CORS explicite et persistance après `down/up`.
Aucun hôte permanent, DNS, trafic de production, compte payant ou bucket distant
n’a été créé/modifié. Les gates distants de #46 restent ouverts.
Le périmètre réduit couvre Auth et TablesDB avec PostgreSQL, Redis, Geo et les
workers databases/deletes/mails. Il n’inclut ni Functions, Sites, Realtime, Console UI,
ni une chaîne de transcodage ; les médias du produit restent destinés à B2.
Les preuves de compatibilité #45 sont réutilisées, pas rejouées contre le compte B2.

## Rejouer localement

Prérequis : Bun 1.3.14, Docker Compose v2, au moins 2 CPU et 8 Gio disponibles
pour Docker (prévoir la concurrence des autres projets), 20 Gio libres pour
cet essai synthétique. Inspecter la capacité et les réseaux avant le lancement.
Les ports 19446/19447 et réseaux 10.245.46.0/24 et 10.245.146.0/24 sont propres à
cette tâche ; ils diffèrent de `nfe-migration-probe` et des autres workers.

```sh
cd infra/appwrite
bun install --frozen-lockfile
bun run prepare:local
bun run validate
bun run up
bunx playwright install chromium
bun run proof
bun run typecheck
bun run lint
bun run build
bun run down
```

Le premier `prepare:local` vérifie le SHA-256 du Compose upstream exact avant
extraction ; les versions Appwrite 2.6.2, PostgreSQL 0.1.0, Redis 7.4.7-alpine,
Geo 0.3.2, nginx 1.28.0-alpine et Mailpit 1.27.10 sont épinglées. La source est
au commit `54581f9698f9de23cf4b1432e353b3ee9b0012d5`, SHA-256
`db8f3fb69b5ff026d3b76dd0f87b13b37cd009a838ae63e48b134292b9f6bea6`.
Pas de copie vendored du fichier de plus de 2 000 lignes ni Docker socket.
Les tags exacts évitent `latest` ; avant déploiement distant, enregistrer aussi les
digests de toutes les images approuvées dans le manifeste de livraison.

Le générateur crée `.local/` ignoré (0700), secrets aléatoires de 256 bits et
fichiers 0600. Il ne lit ni `.env.local` ni les secrets d’un autre environnement.
Ne jamais publier `compose.json`, admin/identity JSON, cookies ou rendu Compose.
`validate` effectue le rendu en mémoire et vérifie réseau interne, absence de
socket Docker et publication exclusive du proxy en loopback, sans afficher les
valeurs. Les erreurs Docker sont supprimées pour éviter les fuites : diagnostic
privé via les commandes Compose ciblant explicitement ce projet, sans joindre les
sorties brutes. Le fichier `local.example.json` peut être copié hors Git pour
choisir un suffixe de projet, ports et deux sous-réseaux libres ; passer ce chemin
à `bun environment.mts prepare /chemin/local.json`. Le nom doit commencer par
`nfe46-local`. Les configurations distantes sont refusées.

`prepare` refuse une configuration déjà créée et toute ressource préexistante
avec le même label de projet ; il ne régénère jamais les secrets sur les données
existantes. `stop` conserve conteneurs/volumes ; `down` supprime conteneurs et
réseaux, **conserve les volumes** ; `up` les réutilise. La preuve automatisée vérifie
la persistance du même compte et de la session navigateur après `down` puis `up`.
Une vérification serveur indépendante de ce cycle reste conservée dans l’historique.
Le test utilise uniquement des identités `example.test`. `proof` peut être rejoué
sur le même état ; après destruction des volumes, retirer les identifiants
synthétiques locaux avant un nouveau bootstrap.

Pour supprimer définitivement les données synthétiques de ce projet uniquement :

```sh
NFE_DESTROY_LOCAL=1 bun run destroy:local
```

Après contrôle de l’absence de ressources du label `nfe46-local`, retirer `.local/`
si un nouvel environnement est souhaité. Aucun prune global, suppression d’un
bucket ou remplacement de secrets existants n’est autorisé par cette commande.
Le build émet des fichiers dans `.build/` pour vérifier la compilation ; exécuter
les sources avec les scripts ci-dessus, pas ces artefacts déplacés.

## Isolation et limites locales

Seul nginx publie `127.0.0.1:19446` ; aucune DB, Redis, Geo, SMTP ou API Appwrite
n’est directement publiée. Le réseau interne Compose bloque les sorties des
services ; seul le proxy rejoint aussi le réseau edge. Nginx route `/v1/` vers
Appwrite et `/mail/` vers Mailpit. Ce dernier n’a aucun relais ni forwarding :
un email adressé accidentellement à une vraie adresse est capturé, jamais remis.
Le DNS SMTP n’est pas configurable dans le template local. La boîte reste privée
au poste local ; ne jamais exposer `/mail/` sur un domaine public.

La preuve crée un projet Appwrite local séparé, une plateforme web `localhost`,
un compte synthétique, une session navigateur avec cookies, puis déclenche Auth
verification et attend la réception Mailpit. Le contrôle négatif utilise une origine
HTTPS synthétique non enregistrée `unregistered.example.test` : seul son document
est fourni par Playwright, les appels API atteignent le même proxy Appwrite réel.
La permission Chromium `local-network-access` est accordée à cette seule origine
pour laisser CORS décider, sans désactiver la sécurité web. Un appel serveur exige
403 `general_unknown_origin` sans ACAO ; les métadonnées réseau CDP confirment le
403 sans ACAO du navigateur, dont le JavaScript ne peut lire la réponse.
Le contrôle positif `localhost` et la persistance navigateur passent également.
Le healthcheck serveur est
un vrai appel Bun vers le proxy ; **l’intégration du serveur Start n’est pas
implémentée dans ce lot** (ses routes sont hors périmètre). Les cookies HTTP
localhost ne prouvent pas Secure/SameSite sur les futurs sous-domaines HTTPS.

Limite nginx : 20 Mio par requête, 20 requêtes/s par IP avec burst 40 ; protections
Appwrite `_APP_OPTIONS_ABUSE=enabled`. Les uploads média iront directement à B2
par URL présignée avec autorisation et limites serveur, pas via ce proxy ; la
valeur Appwrite `_APP_STORAGE_LIMIT=20971520` concerne Storage non couvert ici.
Les appels health publics et DB/Redis/Mailpit ont des healthchecks ; liveness des
workers et disponibilité métier doivent aussi être testées via les scénarios
Auth/TablesDB, pas déduites du seul processus actif.

## Préparer staging et production sans les déployer

Le [manifeste exemple](../../infra/appwrite/deployment.example.json) décrit les
informations manquantes. Ses domaines `.invalid` et valeurs nulles ne permettent
pas un déploiement. Inventorier d’abord l’hébergement existant avec l’opérateur :
OS, CPU/RAM/disque, sauvegardes/restauration, connectivité, proxy et propriétaire.
Ne supposer ni Coolify, ni nouveau fournisseur, ni Appwrite Sites.

| Élément | Local | Staging | Production |
| --- | --- | --- | --- |
| Instance / projet / DB / volumes | nfe46-local, synthétiques | stack et projet nfe-staging dédiés, à confirmer | stack et projet nfe-production dédiés, à confirmer |
| API / web | localhost:19446 / :19447 | sous-domaines HTTPS dédiés, non attribués | sous-domaines HTTPS dédiés, non attribués |
| Emails | Mailpit sans sortie | capture par défaut, test réel uniquement vers destinataire autorisé | fournisseur SMTP et domaine validés |
| B2 | preuve existante du seul bucket nfe-webapp-dev | bucket privé et clé dédiés à créer après confirmation | bucket privé et clé dédiés à créer après confirmation |
| Secrets | générés hors Git | coffre/secret store staging | coffre/secret store production séparé |

Procédure après confirmation de cible, dans une tranche autorisée distincte :

1. Dimensionner et réserver hôte/réseaux/volumes distincts, pare-feu 80/443 sur le
   seul proxy, SSH restreint, DB/Redis/SMTP privés. Adapter la topologie locale :
   elle bloque volontairement l’egress et n’est pas un Compose de production.
2. Terminer TLS au proxy prévu avec certificats valides, renouvellement testé,
   redirection HTTP→HTTPS et HSTS après validation. Définir `_APP_DOMAIN`, domaines
   Console et hostnames permis, forcer HTTPS côté Appwrite, transmettre Host et
   X-Forwarded-Proto depuis ce proxy de confiance seulement. Fermer `/mail/` et
   les interfaces d’administration publiques non nécessaires.
3. Créer un projet et ses plateformes exactes par environnement, sans wildcard
   ni `localhost` en production. Configurer domaines de retour Auth, OAuth et
   cookies ; garder API/web sur le même site registrable si possible. Tester
   CORS autorisé/refusé, preflight, credentials, cookie Secure/HttpOnly/SameSite,
   login/logout, vérification/reset et session SSR depuis Start réel.
4. Conserver Mailpit pour tous les tests automatiques. Pour l’essai SMTP réel de
   staging, confirmer fournisseur, TLS SMTP (465 implicite ou 587 STARTTLS selon
   contrat), domaine expéditeur, SPF/DKIM/DMARC et destinataire de test autorisé.
   Secrets dans le coffre, identifiants distincts ; egress limité au relais.
   Demander Auth verification/reset, vérifier livraison et logs expurgés, puis
   revenir en capture pour les tests automatiques. Sans cette réception réelle,
   le critère SMTP staging reste partiel. Resend n’est pas supprimé du produit
   existant ; inventorier ses usages transactionnels avant la migration.
5. Injecter des clés Appwrite distinctes par rôle (runtime serveur à scopes
   minimaux, import temporaire, administration opérateur), aucune clé admin/import
   dans le client, puis tester une lecture/écriture autorisée et un refus par rôle.
6. Sauvegarder, exécuter les preuves sans données réelles ni trafic utilisateur,
   faire relire le manifeste et les résultats ; aucune bascule DNS/production
   n’est incluse dans #46.

## B2 par environnement

La [preuve B2 #45](b2-probe.md) établit la compatibilité du bucket de développement
existant. Ce lot ne lit pas la clé compte large et ne modifie aucun compte/bucket.
Pour staging et production, exiger le nom du bucket, la région et le budget
confirmés avant toute création. Choisir une région compatible avec les contraintes
de données ; ne pas déduire celle-ci de la clé dev.

Configurer buckets **privés**, SSE-B2, versions/rétention explicites, suppression
des versions anciennes selon la politique approuvée et annulation des multipart
inachevés après 7 jours si ce délai convient. Éviter Object Lock sans exigence :
sa rétention peut empêcher les suppressions attendues. La suppression applicative
doit gérer les versions et obligations de conservation, pas seulement un marker.

Clé applicative serveur par bucket et environnement, restriction au bucket et
préfixe si nécessaire, droits objet strictement requis (lecture/écriture/suppression,
liste de versions/multipart seulement si le flux l’exige), sans droits compte,
création de buckets ou gestion de clés. La clé import temporaire est distincte
et révoquée après usage. Aucun secret B2 dans le navigateur ni dans les clés
Appwrite. Vérifier l’accès au bucket attendu et le refus sur les autres buckets
sans tenter de modifier ceux-ci.

CORS doit lister les origines web HTTPS exactes, les méthodes GET/HEAD/PUT
nécessaires et les headers réellement utilisés (Content-Type, Range, headers
signés x-amz-* selon SDK), exposer ETag pour multipart et Content-Range,
Accept-Ranges/Content-Length pour lecture vidéo. Ne pas ajouter des origines ou
méthodes globales. Rejouer preflight réel, PUT/GET présignés courts, Range/206,
expiry et multipart reprise/abort dans chaque nouvel environnement. Mettre les
limites d’upload/type/durée et droits utilisateur dans le serveur qui signe les
URLs ; CORS ne remplace pas cette autorisation.

Budgéter stockage courant + versions + multipart abandonnés, egress et requêtes,
avec alertes et plafond validés au tarif du jour ; voir mesures modestes #45,
qui ne représentent pas une charge de production. Aucun CDN ni transcodage
n’est provisionné par ce lot.

## Exploitation

Point de départ à mesurer : 4 vCPU / 8 Gio et disque SSD 100 Gio pour staging
faible charge, 8 vCPU / 16 Gio / 200 Gio pour une première production modeste.
Ce sont des hypothèses de capacité, pas une garantie ; surveiller latence, RAM,
connexions DB, files workers et disque. Conserver au moins 30 % libre, seuils
70/85 %, croissance DB/Redis/logs/sauvegardes et données Appwrite. Les objets B2
ne dispensent pas de sauvegarder les métadonnées et Auth PostgreSQL.

Rotation json-file : 10 Mio × 3 par conteneur. Rétention centralisée et expurgation
avant export ; ne jamais exporter tokens, cookies, emails ou Compose rendu.
Surveiller healthchecks, erreurs Auth, file mails/deletes/databases et saturation.
Aucune surveillance différée n’est installée ici.

Sauvegarder PostgreSQL en cohérence, volumes Appwrite utiles et clé de chiffrement
`_APP_OPENSSL_KEY_V1` dans un coffre séparé ; chiffrer les sauvegardes et tester
la restauration sur une instance isolée. Redis utilise AOF et volume persistant ;
valider reprise des files et traitements sans duplication après incident. Définir
RPO/RTO avec l’opérateur avant production, ne pas assimiler un volume à un backup.

Mise à jour : lire les migrations/release notes officielles depuis la version
épinglée, sauvegarder et tester restauration, approuver tags+digests, appliquer
sur staging, lancer les migrations prescrites puis preuves Auth/TablesDB/SMTP/B2
et session Start. Déployer en fenêtre validée. En cas d’échec, arrêter les writes
et restaurer sauvegarde + secrets + images de même version ; un simple downgrade
d’image après migration de schéma n’est pas un rollback sûr.

Rotation des clés runtime/B2 : créer la remplaçante aux mêmes scopes restreints,
injecter au seul environnement concerné, tester, révoquer l’ancienne puis tester
son refus. Révoquer les clés import immédiatement après usage. La clé OpenSSL
chiffre les secrets persistés : ne jamais la remplacer aléatoirement sur des
volumes existants ; suivre la procédure officielle de la version et vérifier la
restauration. Changer mot de passe DB de façon coordonnée DB+services et reprendre
les connexions. Aucun script de ce lot ne tourne ces secrets sur un hôte distant.

## Sources et preuves

- [Compose officiel au commit épinglé](https://github.com/appwrite/appwrite/blob/54581f9698f9de23cf4b1432e353b3ee9b0012d5/docker-compose.yml).
- [Variables Appwrite](https://appwrite.io/docs/advanced/self-hosting/configuration/environment-variables),
  [email](https://appwrite.io/docs/advanced/self-hosting/configuration/email-delivery),
  [migrations](https://appwrite.io/docs/advanced/self-hosting/production/updates).
- [Mailpit : options et absence de relais configuré](https://mailpit.axllent.org/docs/configuration/runtime-options/),
  [API S3 B2](https://www.backblaze.com/docs/cloud-storage-call-the-s3-compatible-api),
  [CORS B2](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules).

Les preuves expurgées sont versionnées sous `infra/appwrite/evidence/`. Elle prouve uniquement les résultats listés et les versions
exécutées ; les gates Start réel, TLS distant, SMTP staging et restrictions B2
staging/production restent ouverts. Related #46, mission #43.


## Validation locale

- Sous-package seul dans un répertoire temporaire sans dépendances racine :
  installation gelée, typecheck, lint et build réussis. Les dépendances Node
  restent externes dans le build, notamment les imports optionnels de Playwright.
- Racine après intégration de `main` bd3951b (#79 et import identité) : typecheck,
  lint et build réussis ; les avertissements lint existants sont conservés.
  Le build signale encore la DB indisponible du sitemap ; il ne prouve pas les
  lectures produit. Seules les valeurs auth/Resend nécessaires sont chargées en
  mémoire depuis le fichier protégé, sans copie ni affichage.
- `proof` : cinq contrôles réussis sur Appwrite réel 2.6.2 ; preuve expurgée
  versionnée. Les anciennes tentatives échouées sont conservées dans l’état de tâche.
- Ressources Docker propres au projet supprimées avant livraison.
  TLS distant, SMTP staging, serveur Start réel et B2 par environnement restent
  explicitement partiels ; cette PR ne ferme aucun de ces gates.
