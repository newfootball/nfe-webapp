# Probe Appwrite local — #45

Verdict du 29 octobre 2026 : **11 contrôles Appwrite passent sur une vraie
instance locale jetable**. Cela valide cette tranche expérimentale, pas la
migration complète : B2, vidéo mobile, intégration Start et contrat #44 restent
hors de cette preuve. Refs #45.

## Matrice réellement exécutée

| Élément | Version / portée |
| --- | --- |
| Appwrite self-hosted | `2.6.2`, `/health/version` vérifié |
| SDK serveur Node | `node-appwrite@31.1.0`, exécuté avec Bun |
| SDK web | `appwrite@29.2.0`, login exécuté sous Bun, sans navigateur |
| Bun | `1.3.14` |
| bcryptjs | `3.0.2`, hash synthétique `$2b$10$…` compatible avec le coût 10 de `src/lib/password.ts` |
| PostgreSQL / Redis / Geo | images upstream `appwrite/postgres:0.1.0`, `redis:7.4.7-alpine`, `appwrite/geo:0.3.2` |
| B2 / SDK S3 / Start / Node production | `not_run` dans ce sous-package |

La [release officielle 2.6.2](https://github.com/appwrite/appwrite/releases/tag/2.6.2)
est une release de sécurité self-hosted de la ligne 2.6 ; ce choix est épinglé,
sans `latest`. Les notes des SDK
[Node 31.1.0](https://github.com/appwrite/sdk-for-node/releases/tag/31.1.0) et
[web 29.2.0](https://github.com/appwrite/sdk-for-web/releases/tag/29.2.0)
annoncent explicitement la cible 2.6.x et le format de réponse 2.6.2.
Context7 n'était pas disponible dans cette session ; les sources officielles et
les types des SDK épinglés ont servi de fallback.

## Rejouer

Depuis la racine du checkout, avec Docker et Bun :

```sh
cd tools/migration-probe
bun install --frozen-lockfile
bun run prepare:local
bun run up
NFE_PROBE_LOCAL=1 bun run probe
bun run typecheck
bun run down
```

Toujours exécuter `down`, y compris après un échec. Il supprime uniquement les
conteneurs, réseau et volumes du projet Compose **nfe-migration-probe**, ainsi que
sa clé locale devenue invalide. Pour un second essai avec la même configuration,
faire `up`, `probe`, `down` ; `prepare:local` refuse les fichiers ou ressources
préexistants. Après `down`, on peut retirer manuellement `.local/` avant une
nouvelle préparation. Ne jamais employer ce nom de projet pour un autre service.

Le générateur télécharge le Compose au commit upstream
`54581f9698f9de23cf4b1432e353b3ee9b0012d5`, conserve seulement API, workers
databases/deletes, PostgreSQL, Redis et Geo, et enregistre le SHA-256 du fichier
source. Il supprime les noms globaux, labels de proxy, binds hôte et redémarrages
automatiques. Seul `127.0.0.1:19445` est publié ; le réseau privé utilise
`10.245.45.0/24`. En cas de conflit de port/réseau, arrêter ce probe, sans modifier
les services existants. Cette topologie réduite ne teste pas Functions, Storage,
Realtime, SMTP ni l'exploitation d'une installation complète.

La préparation exige au moins 2 CPU et 8 Gio de mémoire Docker et refuse des
volumes/conteneurs déjà présents. Vérifier aussi `docker stats --no-stream` et
l'espace disque avant `up` : le seuil ne réserve pas de capacité. Au lancement
initial : 18 CPU, environ 19,6 Gio Docker, environ 4 Gio déjà consommés et 524 Gio
disponibles. Les volumes ne sont jamais ceux de la DB du produit ou d'un autre
projet. Les secrets synthétiques sont générés dans `.local/` ignoré, avec fichiers
sensibles en mode 600 ; ne pas afficher ni joindre le Compose ou les identifiants.

## Preuves et limites

[Résultat expurgé](../../tools/migration-probe/evidence/appwrite-2.6.2.json),
[source Compose](../../tools/migration-probe/evidence/compose-source.json).
Le résultat provient d'un redémarrage avec volumes neufs, le 29 octobre à
07:59:01 UTC ; le probe retourne un code non nul dès qu'un contrôle échoue ou
reste `not_run`. Les données sont exclusivement synthétiques.

Cette preuve remplace celle de 07:44:41 UTC après correction de PR73-2 : les
anciens cas négatifs utilisaient aussi un hash bcrypt invalide et ne distinguaient
pas un rejet de mot de passe d’un rejet d’ID. Les six cas utilisent désormais le
même hash synthétique valide (60 caractères, coût 10), importé avec succès pour
les trois IDs valides. Les trois mauvais IDs doivent chacun renvoyer HTTP 400,
`general_argument_invalid` et un message identifiant explicitement `userId` ;
aucun autre HTTP 400 ne suffit. Aucun hash ni message brut n’est enregistré.

| Contrôle | Observation |
| --- | --- |
| Bootstrap | Admin console, équipe, projet et clé synthétiques ; 2.6.2 exige `keyId` lors de la création de clé |
| Bcrypt / login | Import du hash uniquement via `createBcryptUser`, connexion serveur et SDK web réussies ; mauvais mot de passe refusé 401 |
| IDs | Forme CUID, UUID de 36 caractères et alphanumérique de 36 acceptés ; longueur 37, underscore initial et slash refusés avec HTTP 400, type `general_argument_invalid` et paramètre `userId` |
| TablesDB | Trois tables, colonnes et index asynchrones attendus jusqu'à disponibilité |
| Unicité composée | Couple userId/postId répété refusé 409 ; même utilisateur/autre post accepté |
| Recherche sans casse | Égalité et sous-chaîne sur champ NFC/minuscules passent ; `contains(title, "éQUIPE par")` trouve aussi les deux `Équipe PARIS` sur ce PostgreSQL |
| Curseurs / comptage | Cinq lignes parcourues par pages de deux, sans doublon ; ordre `$id` ascendant et total 5 à chaque page |
| Relation | Post → reports 1:N, inverse et expansion explicite par `Query.select(["*", "reports.*"])` |
| Modération | Post caché et report résolu ensemble au commit ; lecture hors transaction inchangée avant commit ; rollback explicite conserve l'état précédent |
| Suppression liée | Suppression du post entraîne la disparition du report, vérifiée par 404 |

La recherche produit utilise actuellement `contains` insensible à la casse sur
nom, titre et description. Le résultat local ne prouve pas toutes les collations,
les langues, la normalisation Unicode, l'absence d'accent ni la performance à
volume réel. Le champ matérialisé fournit une stratégie explicite compatible
sur cet échantillon, à maintenir dans tous les chemins d'écriture/import ; il
n'a pas été ajouté au produit. Aucun full-text, score de pertinence ou comportement
équivalent à PostgreSQL sur le corpus réel n'est affirmé.

Relations N:N, cycles, droits d'accès par utilisateur, cascade Auth → données,
cascade vers B2, conflit concurrent de transaction et pagination sous mutations
concurrentes sont `not_run`. Le tri unique est stable sur un jeu statique ; un
curseur ne constitue pas un snapshot. Le SDK web sous Bun n'apporte aucune preuve
de cookies navigateur, CORS ou session SSR. Les
[transactions documentées](https://appwrite.io/docs/products/databases/tablesdb/transactions)
ont été confirmées par le test sur la release self-hosted ; les quotas Cloud
de cette documentation ne sont pas des quotas mesurés ici.

Le bootstrap antérieur avait échoué avec `user_console_count_exceeded` après
création d'un admin sans identifiants conservés ; ses scénarios étaient alors
`not_run`. Le bootstrap sauvegarde désormais le mot de passe synthétique avant
création et reprend équipe/projet existants. Une tentative suivante a identifié
le paramètre `keyId` manquant. Aucun succès de ces anciens essais n'est supposé.

## B2 et transformations vidéo : non exécutés

Aucun bucket de test ni clé B2 confirmé : **aucun upload distant**, aucun test S3
émulé, aucun remplacement par Appwrite Storage. Protocole opt-in uniquement :
avant toute exécution B2, le contrôle suivant doit réussir sans afficher de secret :

```sh
bun -e 'const required = ["B2_TEST_ENDPOINT", "B2_TEST_BUCKET", "B2_TEST_KEY_ID", "B2_TEST_APPLICATION_KEY"]; if (required.some(k => !process.env[k]) || process.env.B2_TEST_BUCKET_CONFIRMED !== process.env.B2_TEST_BUCKET) throw new Error("B2 not_run: missing env or unconfirmed test bucket"); console.log("B2 preflight only; no request sent");'
```

Ce contrôle ne teste pas B2. Après confirmation explicite du bucket synthétique,
il faudra épingler un SDK S3 compatible Bun puis vérifier SigV4 PUT/GET présigné,
CORS navigateur, URL expirée, multipart création/reprise/annulation/finalisation,
HeadObject, Range/206, suppression et seek sur mobile avec une vidéo représentative.
Consigner tailles, temps, octets et requêtes puis chiffrer les tarifs B2 du jour.
Références : [API S3 B2](https://www.backblaze.com/docs/cloud-storage-call-the-s3-compatible-api),
[CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules).

L'inspection du produit identifie `f_webp,q_auto` dans `src/lib/cloudinary.ts`,
conversion Canvas WebP qualité 0,85 en secours, et `f_mp4` dans
`components/feature/post/post-content.tsx`. Les deux transformations d'URL exigent
un remplacement ou une décision de parité ; B2 seul ne transcode pas. Aucune
mesure de transcode, compatibilité codec mobile, coût CPU/stockage ou inventaire
Cloudinary distant n'a été effectuée. Leur budget reste à établir avec #44.

## Vérifications du patch

- Sous-package : installation `bun install --frozen-lockfile` et `bun run typecheck`
  réussies dans un répertoire temporaire indépendant, sans dépendances racine ;
  11 contrôles réels réussis sur volumes neufs avec les assertions corrigées.
- Racine : `bun run typecheck --incremental false` et `bun run build` réussis
  avec le `node_modules` du probe temporairement renommé puis restauré.
  Le build charge uniquement en processus la configuration privée principale ;
  il termine avec code 0 mais journalise les erreurs DB connues du sitemap.
  Cela ne prouve pas les lectures de la DB produit.
- `bun run lint` réussi avec quatre avertissements de complexité existants.
- `tsconfig.json` exclut précisément le probe optionnel, en conservant l’exclusion
  Start. Un job CI indépendant installe uniquement ce sous-package avec son lock
  frozen puis vérifie ses types ; les jobs racine et Start restent inchangés.
- Aucune dépendance/version racine modifiée ; aucun service produit démarré.
  Les conteneurs, réseau et volumes possédés par le probe sont supprimés avant
  livraison. La CI distante du nouveau head reste à vérifier par le coordinateur.

Adapter le produit ou engager la réécriture attend encore le contrat #44 et les
preuves B2/vidéo/SSR manquantes. Cette PR ne ferme donc pas #45.
