# Sauvegarde et reprise — #47

**Preuve synthétique locale réussie ; #47 reste partiel.** Aucun export de source
réelle, hôte permanent, dépôt hors hôte ou budget RPO/RTO accepté n'est couvert.
Ne pas utiliser ce petit harnais comme sauvegarde de production.

## Preuve et limites

Le [rapport expurgé](../../tools/backup-restore/evidence.json) décrit une vraie
sauvegarde chiffrée, la destruction du projet source et de ses versions B2, puis
une récupération indépendante vers un projet Docker et un préfixe B2 distincts.
Les [essais historiques](../../tools/backup-restore/attempts.json) conservent aussi
les échecs : épuisement réseau Docker, montage PostgreSQL 18 incorrect, clé console
sans `keyId` et déplacement du checkout de schéma pendant un diagnostic.

Le contrat schéma/ACL est le snapshot **non mergé** PR77
`86f28433ed3a6642fd9d120d17de426c92d60a96`, autorisé seulement pour l'expérience
locale. Six fichiers sont lus via `git show`, leurs SHA-256 figurent dans la preuve ;
aucun checkout frère n'est modifié. Renouveler la preuve avec le contrat final
accepté s'il diffère. Le label administrateur partagé est `admin`.

La preuve mesure séparément sauvegarde, restauration froide des volumes et SQL,
puis reprise complète avec médias et rapprochement. Les valeurs autoritatives
sont `timingsMs` dans le rapport, sans assimilation à un RTO accepté. Elle vérifie :

- Trois connexions par mot de passe bcrypt et 160 lectures ACL get/list pour
  A/B/anonyme/admin, avant **et** après récupération ; six liens métier.
- PostgreSQL source : trois utilisateurs, un post et deux médias ; trois mots
  de passe vérifiés, deux lignes jointes via leurs clés étrangères, deux fichiers
  média indépendants retrouvés par SHA-256.
- Appwrite : 13 tables, trois comptes, 20 lignes métier plus une ligne de version
  de schéma, comptes/digests complets et permissions rapprochés avant remappage.
- B2 : trois versions de contenu et un marqueur de suppression ; octets archivés
  indépendamment, GET versionnés/SHA-256, état courant et nombre de versions par
  clé rapprochés. Les originaux écrasés et supprimés proviennent de l'archive.

Onze tests purs couvrent chiffrement/authentification, identités, dry-run,
confirmation, collision de préfixe, nettoyage d'un journal vide, conservation
d'une version étrangère concurrente, marqueurs et versions de même horodatage,
noms physiques Docker occupés/propriété et bootstrap console. Ils complètent
la preuve réelle ; les doublures ne remplacent pas le runtime.

## Procédure rejouable

La topologie suit le Compose Appwrite épinglé de #45/#46, dont le SHA-256 est
vérifié, et Appwrite **2.6.2** avec son PostgreSQL réel. L'image
`appwrite/postgres:0.1.0` contient PostgreSQL 18 ; monter `/var/lib/postgresql`,
jamais l'ancien `/var/lib/postgresql/data`. La sauvegarde de la DB Appwrite est
physique et froide ; le PostgreSQL source séparé utilise `pg_dump`/`pg_restore`.

Les services privés n'exposent aucun port ni accès Internet. Le proxy écoute
uniquement `127.0.0.1:19547` ou `:19548`. Pas de SMTP, Functions, Sites ou trafic
utilisateur. Réseaux propres au harnais : `10.245.47.0/24`, `10.245.147.0/24`,
`10.245.48.0/24`, `10.245.148.0/24`. Vérifier ports et plages libres ; un seul
essai de ce harnais à la fois. Aucune suppression de réseau tiers n'est permise.

1. Générer un UUID complet, 32 hex, pour `nfe47-source-<id>` et
   `nfe47-restore-<id>`. Refuser les identités étrangères et les noms physiques
   existants de tous les conteneurs, réseaux et volumes, même sans label.
2. Lire seulement les variables B2 nécessaires en mémoire. Vérifier le bucket
   privé existant `nfe-webapp-dev`, région `eu-central-003` et endpoint exact.
   Vérifier **les deux** préfixes `nfe-backup-47/source-<id>/` et
   `nfe-backup-47/restore-<id>/` vides avant toute mutation. Une collision est un
   refus, jamais une autorisation de nettoyer.
3. Créer utilisateurs bcrypt, schéma/ACL, fixtures liées, source PostgreSQL et
   médias locaux synthétiques. Comparer les accès à une matrice indépendante du
   constructeur d'ACL. Créer les objets B2 écrasé/supprimé sous le seul préfixe
   source ; journaliser immédiatement les `Key/VersionId` renvoyés par chaque
   PUT/DELETE, y compris les marqueurs, dans un fichier local protégé.
4. Inventorier B2, lire chaque version par GET et SHA-256, puis vérifier que
   l'inventaire est stable. Arrêter proxy/Appwrite/workers, dumper la source SQL
   sans écrivain concurrent, puis arrêter tout le projet. Archiver tous les
   volumes déclarés Appwrite : PostgreSQL, Redis, cache et configuration.
5. Inclure Compose, environnement et `_APP_OPENSSL_KEY_V1`, dump SQL, médias
   source, inventaire B2 et copies indépendantes de chaque version dans une
   archive **AES-256-GCM**. SQL/tar circulent en mémoire ; aucun export clair sur
   disque. Dossiers 0700, fichiers 0600, `.local/` ignoré. Limites : moins de
   128 Mio compressés par volume et 1 Mio par média ; architecture volontairement
   limitée à cette petite preuve synthétique.
6. Supprimer uniquement les versions dont les reçus figurent au journal du run,
   puis détruire la source Docker avant reprise. Le nettoyage ne réinventorie
   **jamais** un préfixe pour décider quoi supprimer et n'efface aucun autre ID.
7. Déchiffrer/authentifier et valider identité, topologie, inventaire et checksums
   avant extraction. Refuser toute configuration cible préexistante et tous les
   noms physiques occupés. Après création, inspecter chaque nom et label de
   propriété, puis extraire dans les volumes arrêtés. Restaurer SQL et démarrer.
8. Rejouer chaque version B2, marqueurs historiques compris, en plaçant
   explicitement la version `latest` en dernier pour chaque clé, même en cas
   d'horodatages égaux. Rapprocher chaque version et l'état courant. Les nouveaux
   IDs B2 nécessitent une table de correspondance protégée et le remappage du
   média Appwrite, seulement après rapprochement des lignes/ACL originelles.
9. Mesurer, rapprocher comptes/liens/login/ACL/octets, puis nettoyer les seuls
   objets Docker et versions B2 possédés. Retirer configurations, médias clairs,
   copie temporaire du contrat et journaux après nettoyage réussi. En cas
   d'échec du nettoyage, conserver les reçus protégés pour intervention ciblée.

Le versionnement et la rétention B2 seuls ne constituent pas une sauvegarde.
Les octets indépendants sont dans l'archive chiffrée ; sa présence locale ne
prouve aucun dépôt hors hôte ni protection contre la perte de cette machine.

## Commandes

Prérequis : Bun 1.3.14, Docker Compose v2, capacité/ports/réseaux disponibles,
checkout exact du snapshot autorisé. Dans `tools/backup-restore` :

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run lint
bun run build
bun run proof # dry-run : aucun secret lu, aucune mutation
bun run proof --run --confirm-isolated \
  --schema-checkout /chemin/checkout-schema-accepte \
  --b2-env /chemin/protege/env-local
```

Ne jamais copier `.env.local` ni publier les logs Docker, cookies, clés, dump ou
configuration rendue. Les erreurs publiées contiennent seulement étape,
localisation de code et statut ; pas les messages susceptibles de contenir des
valeurs. La CLI reste synthétique et part en dry-run :

```sh
bun run cli.mts --action inspect --archive .local/SOURCE.nfe47 --run
bun run cli.mts --action restore --archive .local/SOURCE.nfe47 \
  --target nfe47-restore-1234567890abcdef1234567890abcdef \
  --confirm-target nfe47-restore-1234567890abcdef1234567890abcdef \
  --b2-env /chemin/protege/env-local --run
bun run cli.mts --action destroy \
  --target nfe47-restore-1234567890abcdef1234567890abcdef \
  --confirm-target nfe47-restore-1234567890abcdef1234567890abcdef --run
```

`destroy` ne nettoie que Docker. Pour une reprise manuelle, conserver le journal
protégé de versions B2 jusqu'à suppression des **seuls IDs reçus** par ce run ;
utiliser `eraseMedia(client, journal)` et jamais une suppression de préfixe,
de bucket ou un prune global. Après interruption, inspecter les reçus et les
ressources possédées ; aucune reprise destructive automatique n'est implicite.
La preuve conserve l'archive `.nfe47` et sa `.key` locales en 0600 pour la revue
indépendante. Les placer dans des coffres distincts et hors hôte pour une future
utilisation opérationnelle, ou supprimer explicitement ces deux fichiers après
revue. Aucun ordonnanceur n'est installé.

## Portes opérationnelles

| Décision / preuve | État |
| --- | --- |
| Source réelle autorisée, hôte permanent et topologie déployée | Non exécutés, coordination #46/opérateur requise |
| Dump PostgreSQL réel, médias accessibles et configuration réelle | Non exécutés |
| Restauration synthétique du snapshot 86f2843 | Réussie localement ; renouveler avec schéma final accepté |
| Copie chiffrée hors hôte, accès indépendant et clé séparée | Non exécutés ; destination/propriétaire à désigner |
| RPO, fréquence, RTO et taille représentative | Inconnus ; les durées synthétiques ne valent pas acceptation |
| Rétention, effacement de compte et lifecycle B2 | Politique à définir et signer sans modifier le bucket partagé |
| Responsable, déclenchement et exercice périodique | À attribuer ; aucun cron, routine cloud ou suivi différé |

Avant bascule, approuver ces valeurs et opérer une fenêtre sans écritures produit,
imports et uploads : la fixture sans écrivain concurrent ne démontre pas une
transaction globale entre PostgreSQL, Appwrite et B2. Exécuter une sauvegarde
réelle autorisée, une copie hors hôte et une récupération avec une clé obtenue
indépendamment. Garder #47 ouvert tant que ces preuves manquent.

Référence : [Appwrite — Backups](https://appwrite.io/docs/advanced/self-hosting/production/backups).
La page générique mentionne d'autres moteurs ; utiliser la topologie PostgreSQL
réellement épinglée, sans appliquer ses commandes MariaDB aveuglément.
