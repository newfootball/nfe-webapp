# Import isolé des identités (#50)

Le CLI de `tools/identity-import` prépare une migration reprenable, sans changer
les IDs publics et sans basculer les connexions. **Statut partiel** : aucun export
réel, aucune répétition représentative, aucun import de production. Les gates
#47 (sauvegarde/restauration) et #49 (schéma/permissions) doivent être validés avant
une répétition sur copie protégée autorisée. Le CLI livré refuse les cibles hors
`http://127.0.0.1:<port>/v1` et les projets sans préfixe `nfe-identity-`.

## Source autoritative et exceptions

L'auth actuelle (`src/lib/auth.ts`, `src/lib/password.ts`) utilise better-auth et
bcryptjs, coût 10. Le secret actif est **Account.password** du compte
`providerId=credential`, dont `accountId=User.id`. Il doit être unique par user.
La migration `20251129_migrate_to_better_auth` a ajouté ces colonnes sans recopier
les hashes historiques de `User.password` : ce dernier n'est jamais un fallback
automatique. Une divergence est une anomalie auditée, sans remplacer le hash actif.

| Cas | Traitement |
| --- | --- |
| Credential bcrypt `$2a/$2b/$2y`, coût 04–16 | API Users.createBcryptUser ; préserver ID, email et emailVerified |
| Ancien User.password seul | Différer ; preuve de propriété/récupération contrôlée, aucune réactivation silencieuse |
| Hash absent, incompatible ou coût >16 | Différer ; aucune génération ni attribution de mot de passe |
| Google seul | Différer ; reconnexion et liaison par sujet fournisseur vérifié, jamais par email seul |
| Credential + Google | Importer uniquement le credential ; signaler la liaison Google à refaire |
| Provider inconnu, credential multiple ou accountId différent | Différer pour investigation protégée |
| Email absent/invalide ou ID incompatible avec Appwrite | Différer sans réécrire l'identifiant |
| Email contenant des majuscules | Différer : Appwrite normalise sa casse ; préserver exactement la source exige une décision explicite |
| ID dupliqué ou emails identiques sans distinction de casse | Différer toutes les lignes impliquées |
| Cible préexistante sans preuve d'appartenance à ce checkpoint | Collision ; aucune adoption, fusion ni mutation |
| ADMIN absent de l'allowlist protégée | Différer le compte entier ; aucun privilège implicite ni rétrogradation silencieuse |

Aucun nom, profil métier, Session, Verification/resetToken, accessToken,
refreshToken ou idToken n'est lu ou transféré. Les champs supplémentaires sont
rejetés par le schéma strict. La projection conserve uniquement le `accountId`
Google nécessaire à l'inventaire ; il ne crée aucune identité OAuth Appwrite.
Les utilisateurs devront se reconnecter. Le rétablissement Google, les callbacks,
la protection contre la liaison par email et le parcours de récupération nécessitent
une preuve séparée avant activation. Aucun email n'est envoyé par cet outil.

## Adaptateur source protégé

Entrée : un fichier JSON projeté autorisé, appartenant à l'UID courant, mode 600
(ou plus restrictif), fichier régulier sans symlink, taille maximale 64 MiB.
Aucune connexion automatique à PostgreSQL ni variable DATABASE_URL n'est utilisée.
Ne pas exporter de source vivante pour essayer cet outil. Après #47/#49 et une
autorisation spécifique, préparer cette projection dans l'environnement protégé
à partir d'une copie immuable ; ne jamais passer un dump brut contenant des tokens.

```json
{
  "version": 1,
  "users": [{
    "id": "synthetic-user",
    "email": "synthetic@example.test",
    "emailVerified": false,
    "role": "USER",
    "legacyPassword": null,
    "accounts": [{"providerId": "credential", "accountId": "synthetic-user", "password": "<protected bcrypt hash>"}]
  }]
}
```

Le champ projeté `legacyPassword` provient de `User.password`. `accounts` contient
seulement `providerId`, `accountId` et `password` ; ne jamais exporter les colonnes
OAuth. Le dry-run et les erreurs CLI ne journalisent ni valeurs de lignes, ni
emails, ni hashes, ni messages bruts du SDK. Les rapports contiennent uniquement
les agrégats, codes d'anomalies et références HMAC. Pour retrouver une exception,
l'opérateur autorisé recalcule HMAC-SHA256(JSON.stringify(id)) avec la clé du
checkpoint dans l'environnement protégé ; ne jamais publier cette clé ou un mapping
ID/email dans les logs. Un dry-run sans checkpoint utilise une clé éphémère :
ses références ne sont volontairement pas corrélables aux exécutions suivantes.

## Commandes

Depuis la racine du dépôt, avec les fichiers protégés déjà présents :

```sh
bun install --cwd tools/identity-import --frozen-lockfile --ignore-scripts
bun run --cwd tools/identity-import import --source /protected/source.json --source-authorized --dry-run --report /protected/dry-run.json
```

Par défaut, le dry-run est **hors ligne** et ne lit aucune cible :
`eligible_offline` ne prouve pas l'absence de collisions côté Appwrite. Ajouter
`--online-check` et une configuration de cible isolée pour effectuer les lectures
Users.get/list sans mutation. `--apply` exige un checkpoint. La configuration
`NFE_IDENTITY_ENDPOINT`, `NFE_IDENTITY_PROJECT`, `NFE_IDENTITY_KEY` est fournie par
un gestionnaire de secrets/environnement ; ne jamais placer la clé dans argv.
Le scope requis est limité à `users.read` et `users.write`.

```sh
bun run --cwd tools/identity-import import --source /protected/source.json --source-authorized --apply --checkpoint /protected/checkpoint.json --report /protected/report.json --admin-policy /protected/admin-ids.json
```

L'allowlist est un tableau JSON d'IDs administrateur explicitement approuvés,
protégé avec les mêmes règles que la source. Chaque ID doit correspondre à un
ADMIN de cette projection. Le mapping privilégié est `ADMIN` → label serveur `admin`, aligné avec #49 ;
Appwrite 2.6.2 refuse les labels contenant des tirets (`nfe-admin` rejeté HTTP 400). aucun rôle privilégié ne provient des préférences utilisateur.
L'audit durable du checkpoint enregistre `admin_approved` avant l'opération serveur
et `admin_applied` après son succès. Les labels sans rapport sont conservés.

Codes de sortie : 0 = toutes les lignes admissibles sont traitées ; 2 = comptes
différés, collisions ou erreurs partielles ; 1 = entrée/configuration invalide ou
échec global. Inspecter également le rapport : un avertissement Google/historique
peut accompagner un credential correctement importé. Aucun résultat hors ligne
ne constitue une autorisation d'importer.

## Reprise, idempotence et panne

Le checkpoint contient une clé HMAC aléatoire, une empreinte de la projection
complète, de la cible et de l'allowlist, puis les étapes `intent/owned/done` par
référence opaque. Changer la source, son ordre, la cible ou l'allowlist bloque
la reprise. Ne pas éditer le checkpoint pour contourner ce contrôle.
Écriture atomique par fichier temporaire exclusif en mode 600, fsync, rename et
fsync du répertoire. Le rapport utilise le même mécanisme. Le checkpoint ne contient
ni ID clair, ni email, ni hash de mot de passe ; sa clé reste néanmoins sensible.

Un verrou exclusif interdit deux writers sur le même checkpoint. Après SIGKILL,
il peut rester un `.lock` ; un opérateur doit confirmer l'arrêt du processus avant
de retirer uniquement ce verrou. Utiliser un seul importeur par projet isolé :
les clés uniques Appwrite bloquent les créations concurrentes, mais aucun verrou
distribué entre checkpoints différents n'est fourni.

La création est précédée d'une intention persistée, suivie d'un marqueur HMAC
par identité dans les prefs, puis de la vérification email et du label autorisé.
Le marqueur sert uniquement à réconcilier une migration isolée, jamais à autoriser
un administrateur. La reprise vérifie aussi ID/email/hash. Un compte modifié ou
supprimé côté cible est une collision, sans écrasement automatique. Un crash
entre création et marqueur laisse un orphelin **bloqué**, à examiner manuellement
sur la cible jetable ; l'outil ne l'adopte jamais par ID/email seuls. Ne pas
supprimer un compte existant pour forcer la reprise sur une cible non jetable.
Une panne après le marqueur reprend les étapes restantes ; un compte terminé ne
reçoit plus d'écritures. Aucun remplacement de hash ni session n'est créé au rejeu.

## Preuve synthétique rejouable

Le compose réduit dérive du prototype existant et de l'upstream Appwrite épinglé
au commit `54581f9698f9de23cf4b1432e353b3ee9b0012d5`, version **2.6.2**,
SDK serveur **31.1.0**. Projet Docker `nfe-identity-50`, port loopback **19550**,
sous-réseau **10.245.50.0/24** ; il refuse de réutiliser des ressources préexistantes.
Les secrets synthétiques sont dans `.local` ignoré, sans accès au `.env.local`
parent. Ne démarrer aucune autre exécution simultanée de ce projet.

```sh
bun run tools/identity-import/local.ts prepare
bun run tools/identity-import/local.ts up
NFE_IDENTITY_SYNTHETIC=1 bun run --cwd tools/identity-import proof
bun run tools/identity-import/local.ts down
```

La preuve exécute l'import interrompu après son marqueur, puis la reprise et le
rejeu via **de nouveaux processus CLI**. Elle vérifie le vrai login bcrypt, le
rejet d'un mauvais mot de passe, les IDs/emails, les deux valeurs de vérification,
le rôle privilégié et les collisions. Le rapport expurgé est versionné dans
`tools/identity-import/evidence/synthetic.json`. La preuve n'envoie aucun email et
ne simule pas une liaison Google réussie. `down` retire uniquement les ressources
Docker de ce projet ; les fichiers privés restants doivent être supprimés uniquement
après vérification qu'aucune preuve n'en a encore besoin.

Validation sans services :

```sh
bun run --cwd tools/identity-import test
bun run --cwd tools/identity-import typecheck
bun run --cwd tools/identity-import lint
bun run --cwd tools/identity-import build
```

La CI installe les dépendances enfant depuis son lockfile, puis exécute ces contrôles.
`checks.ts` est invoqué explicitement ; il n'ajoute pas de dépendance SDK à la
collecte par défaut des tests Bun de la racine.

Référence API : [Users Appwrite](https://appwrite.io/docs/references/cloud/server-nodejs/users).
L'API documente l'import bcrypt, les IDs personnalisés, la vérification d'email et
les labels ; la preuve locale épinglée reste l'autorité sur la compatibilité réelle.
