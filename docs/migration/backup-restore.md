# Sauvegarde et reprise — #47

**Draft bloqué : aucune restauration démontrée.** Le package propose une procédure
rejouable et des garde-fous testés ; ses deux essais réels s’arrêtent au démarrage
Docker, avant les fixtures. Ne pas fermer #47, importer une source réelle ou
utiliser ces scripts comme sauvegarde de production. Aucun RPO/RTO accepté,
temps de reprise ou rapprochement de comptes récupérés n’est disponible.

## État et périmètre

- [Échecs conservés](../../tools/backup-restore/attempts.json) : premier essai,
  3,328 s, plages réseau automatiques Docker épuisées ; second essai, 24,452 s,
  démarrage impossible. Une reproduction diagnostique confirme que le PostgreSQL
  source séparé quitte avec code 1 alors qu’Appwrite, sa DB, Redis et Geo deviennent
  healthy. La cause d’initialisation source reste à résoudre. Ces durées sont des
  **durées d’échec**, pas des RTO.
- [Rapport runtime](../../tools/backup-restore/evidence.json) : statut `failed`,
  aucune assertion de restauration atteinte, nettoyage réussi.
- Six tests de garde passent : chiffrement/déchiffrement, clé incorrecte,
  altération/troncature, identité de projet, préfixes B2, dry-run et confirmation
  explicite. Ils ne prouvent pas la restauration métier.
- Budget de correction partagé épuisé : **3/3**. Le coordinateur a demandé de
  conserver le draft sans nouvelle réparation.
- Aucun export source réel, archive finale, restauration B2 ou copie hors hôte
  n’a été créé. Les configurations synthétiques temporaires ont été supprimées.

Le contrat schéma/ACL réutilisé est le snapshot **non mergé** de PR77,
`86f28433ed3a6642fd9d120d17de426c92d60a96`, accepté par le coordinateur uniquement
pour l’expérience locale. Les six sources importées sont lues par `git show`,
copiées sous `.local/contract/` avec SHA-256 enregistrés dans le rapport ; le
checkout schéma reste en lecture seule. Renouveler la preuve si le schéma mergé
diffère. L’administrateur utilise le label alphanumérique `admin`.

## Procédure proposée, non validée de bout en bout

La topologie synthétique suit le sous-ensemble PostgreSQL d’Appwrite 2.6.2 et le
Compose upstream épinglé de #45/#46 ; son SHA-256 est vérifié avant extraction.
Les services privés n’ont pas de port publié ni d’accès Internet ; nginx expose
seulement `127.0.0.1:19547` (source) ou `:19548` (restauration). Pas de SMTP,
Functions, Sites ou trafic utilisateur. Réseaux dédiés : `10.245.47.0/24` et
`10.245.147.0/24`, puis `10.245.48.0/24` et `10.245.148.0/24`. Leurs éventuelles
collisions doivent être vérifiées avant exécution ; aucun prune n’est permis.

1. Créer deux projets Compose uniques `nfe47-source-<8 hex>` et
   `nfe47-restore-<8 hex>`. Refuser un projet existant, une cible identique à la
   source, des volumes externes, des bind mounts et une identité non synthétique.
2. Créer les utilisateurs bcrypt A/B/admin, le schéma et ses fixtures liés ; créer
   une source PostgreSQL synthétique avec clés étrangères et médias locaux
   protégés. Comparer les lectures get/list A/B/anonyme/admin à une matrice
   indépendante du constructeur d’ACL.
3. Créer uniquement sous `nfe-backup-47/source-<8 hex>/` du bucket privé existant
   `nfe-webapp-dev` un objet écrasé et un objet supprimé. Inventorier les versions
   et tombstones, copier chaque version par GET, calculer SHA-256 sur les octets
   et vérifier que l’inventaire n’a pas changé. Aucune règle de bucket, CORS,
   lifecycle, clé ou configuration du compte n’est modifiée.
4. Arrêter proxy/Appwrite/workers, effectuer `pg_dump -Fc --no-owner --no-acl`
   de la source avec son seul écrivain arrêté, puis arrêter tout le projet.
   Archiver **tous les volumes réellement déclarés** d’Appwrite, y compris sa DB
   PostgreSQL physique, Redis, cache et configuration. La source PostgreSQL est
   restaurée logiquement par `pg_restore`, pas via son volume physique.
5. Inclure Compose, environnement et clé exacte `_APP_OPENSSL_KEY_V1`, dump source,
   médias source indépendants, inventaire B2 et octets de chaque version dans une
   archive AES-256-GCM authentifiée. Le tar circule en mémoire depuis Docker,
   sans export SQL/tar en clair sur disque. Dossiers 0700, fichiers 0600, répertoire
   `.local/` ignoré. Limite volontaire : petite preuve synthétique en mémoire,
   volume compressé inférieur à 128 Mio et média inférieur à 1 Mio ; cette
   architecture n’est pas dimensionnée pour une sauvegarde réelle.
6. Supprimer les seules versions B2 possédées et détruire le projet source avant
   récupération, afin que le test ne dépende plus des originaux. Restaurer vers
   une cible vide explicitement confirmée, avec exactement les mêmes images et
   secrets ; ne jamais mélanger des volumes de deux dates ou changer de moteur.
7. Déchiffrer et authentifier avant toute mutation Docker. Recréer les volumes
   arrêtés, restaurer leur contenu et le dump SQL, démarrer la cible. Rapprocher
   comptes, lignes, digest complet des lignes/ACL, liens et login bcrypt.
8. Réécrire les octets B2 archivés sous un préfixe de restauration différent,
   vérifier chaque version par GET/SHA-256 et recréer les tombstones finaux.
   Les version IDs B2 sont nouveaux : produire une table de correspondance
   protégée et rebrancher la référence média Appwrite après rapprochement de
   l’état original. Les ACL doivent rester identiques. Ce comportement reste
   **non éprouvé**, comme toute la séquence après le démarrage.
9. Mesurer séparément sauvegarde, restauration froide et récupération complète,
   puis supprimer les seules ressources Docker/préfixes B2 de l’essai. Nettoyer
   les exports/configurations en clair, conserver seulement le rapport expurgé.

L’inventaire/les données B2 restent **à l’intérieur de l’archive chiffrée**, jamais
dans la preuve Git. Un versionnement ou une rétention seuls ne sont pas une
copie indépendante. La copie locale en archive ne prouverait pas, à elle seule,
la copie hors hôte.

## Rejouer après résolution du blocage

Prérequis : Bun 1.3.14, Docker Compose v2, images épinglées disponibles,
capacité Docker adaptée à la concurrence, ports/réseaux libres et checkout exact
du schéma accepté. Depuis `tools/backup-restore` :

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run lint
bun run build
bun run proof # dry-run : aucun secret lu, aucune mutation

# Exécution manuelle synthétique explicite ; actuellement échoue à prepare.
bun run proof --run --confirm-isolated \
  --schema-checkout /chemin/checkout-schema-accepte \
  --b2-env /chemin/protege/env-local
```

Le lecteur B2 autorise seulement les cinq variables B2 nécessaires, vérifie le
bucket, la région `eu-central-003` et l’endpoint exact. Il ne charge pas le reste
de l’environnement parent, ne copie pas `.env.local` et n’utilise aucun secret
OAuth/Resend. Les erreurs runtime sont réduites à une étape et un type ; ne jamais
publier de logs Docker, cookies, API keys ou config rendue pour diagnostiquer.

La CLI de reprise part aussi en dry-run. Exemple **non validé**, utilisable
uniquement avec une archive synthétique réussie et une cible fraîche :

```sh
bun run cli.mts --action inspect --archive .local/SOURCE.nfe47 --run
bun run cli.mts --action restore --archive .local/SOURCE.nfe47 \
  --target nfe47-restore-12345678 --confirm-target nfe47-restore-12345678 \
  --b2-env /chemin/protege/env-local --run
bun run cli.mts --action destroy --target nfe47-restore-12345678 \
  --confirm-target nfe47-restore-12345678 --run
```

`destroy` ne supprime que le projet Docker confirmé ; la preuve automatique
nettoie aussi ses deux préfixes B2. Une reprise manuelle exige un nettoyage
explicite de son préfixe via `eraseMedia`, après vérification des identifiants
possédés ; ne jamais remplacer cela par suppression de bucket ou prune global.
Après une future preuve réussie, l’archive `.nfe47` et son fichier `.key` seraient
conservés localement en 0600 pour la revue indépendante ; la clé doit être placée
dans un coffre distinct de l’archive avant toute utilisation opérationnelle, ou
les deux retirés explicitement après revue. Aucun de ces fichiers n’existe après
les essais échoués consignés ici.

## Portes opérationnelles encore ouvertes

| Décision / preuve | État |
| --- | --- |
| Hôte permanent, topologie réellement déployée, source réelle autorisée | À valider avec #46 et l’opérateur ; aucune action distante dans ce lot |
| Sauvegarde PostgreSQL réelle + médias source accessibles + configuration | Non exécutée |
| Sauvegarde Appwrite complète et restauration synthétique | Implémentation préparée, preuve bloquée |
| Copie chiffrée hors hôte, accès indépendant et clé séparée | Non exécutée, destination/propriétaire à désigner |
| RPO accepté et fréquence de déclenchement | Inconnus, validation propriétaire requise |
| RTO accepté et taille représentative | Inconnus ; aucune durée de reprise mesurée |
| Rétention, effacement de compte, lifecycle/versioning B2 | Politique à définir et signer, sans changer le bucket partagé |
| Responsable, procédure d’incident et restauration périodique | À attribuer ; aucun ordonnanceur installé |

Avant la bascule, l’opérateur doit approuver ces valeurs, exécuter une sauvegarde
cohérente sur une source autorisée, copier l’archive hors hôte et prouver la
récupération avec une clé obtenue indépendamment. Un dump cohérent par base ne
garantit pas une transaction globale PostgreSQL/Appwrite/B2 : la fenêtre sans
écritures du produit, des imports et des uploads doit être explicitement opérée.
La fixture sans écrivain concurrent ne valide pas cette fenêtre réelle.

Référence officielle : [Appwrite — Backups](https://appwrite.io/docs/advanced/self-hosting/production/backups)
pour volumes, configuration et conservation de la clé de chiffrement. La page
générique documente MariaDB/MongoDB : le moteur de cette preuve est le PostgreSQL
réellement épinglé par les contrats #45/#46 ; ne pas appliquer aveuglément les
commandes MariaDB. Aucun cron, cloud routine ou suivi différé n’a été créé.
