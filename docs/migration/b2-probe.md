# Probe Backblaze B2 réel — #45

Verdict du **29 octobre 2026 à 09:05 UTC : réussi** pour cette tranche B2.
La preuve expurgée est [b2-compatibility.json](../../tools/migration-probe/evidence/b2-compatibility.json).
Elle provient d'un vrai bucket privé `nfe-webapp-dev`, région `eu-central-003`,
et de transferts directs dans Chrome local ; ce n'est pas un mock ni un résultat CI.
Refs #45 et #43 : aucune clôture ni validation de migration globale n'en découle.

## Matrice exécutée

| Composant | Version / portée réellement testée |
| --- | --- |
| Bun | `1.3.14`, macOS arm64 |
| SDK S3 / presigner | `@aws-sdk/client-s3@3.1159.0`, `@aws-sdk/s3-request-presigner@3.1159.0` |
| Playwright | `1.64.1`, pilote du Chrome local |
| Chrome | `156.0.8078.49`, headless, contexte temporaire sans profil utilisateur |
| Mobile | émulation **Pixel 7 dans Chromium** ; aucun matériel Android/iOS ni Safari testé |
| FFmpeg | `9.0.1`, MP4 H.264/yuv420p, faststart, 320 × 180, 24 fps, 6 s, sans audio |
| TypeScript du probe | `5.9.3`, dépendances isolées et verrouillées |
| B2 | API S3 compatible réelle, SigV4 ; pas de version serveur B2 publiée à épingler |

Les versions exactes ont été vérifiées au registre avec `bun info` puis installées
avec `--exact`. Context7 était indisponible ; les
[docs AWS du presigner](https://github.com/aws/aws-sdk-js-v3/tree/main/packages/s3-request-presigner),
[docs SDK v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrate-s3.html)
et [docs B2 S3](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)
ont servi de référence, puis les comportements ont été exécutés.

## Preuves observées

| Contrôle | Résultat |
| --- | --- |
| PUT/GET/HEAD présignés dans Chrome | `200/200/200`, octets vérifiés par SHA-256, ETag accessible au JavaScript |
| Multipart navigateur | deux parties de **5 242 880 octets** ; reprise après `ListParts` dans un nouveau contexte navigateur, rejeu réel de la première partie, puis complétion |
| Intégrité multipart | GET `200`, HEAD SDK `200`, 10 485 760 octets et SHA-256 identique à la fixture ; ETag jamais traité comme MD5 |
| Annulation | une partie de 5 Mio réellement envoyée, `AbortMultipartUpload`, absence de l'upload et `ListParts → NoSuchUpload` |
| Bucket privé | accès anonyme à l'objet `401`, listing anonyme `403`, type natif `allPrivate` avant/après CORS |
| Portée de signature | chemin modifié vers une autre fixture existante → `403` |
| Expiration | même URL : `200` avant, `401` après 5 s pour une durée signée de 2 s |
| Vidéo desktop / mobile émulé | metadata 6 s/320 × 180, lecture effective, seek à 3 s ; Range `206`, `Content-Range: bytes 0-1023/173562` dans les deux contextes |
| Objet supprimé | GET présigné encore valide → `404` après suppression de ses versions |
| Nettoyage | trois versions supprimées ; zéro version et zéro upload multipart dans le préfixe du run ; navigateur, serveur et fichiers temporaires arrêtés/supprimés |

Le « retry » est un rejeu intentionnel d'une partie déjà réussie, avec le même
uploadId/numéro ; aucune panne réseau réelle ni reprise après crash de processus
n'est revendiquée. La lecture vidéo porte sur une fixture synthétique de
173 562 octets ; elle ne prouve ni débit de production ni traitement de vidéos longues.

## Rejouer, explicitement

Prérequis : Bun, FFmpeg avec `libx264`, et Chrome local ou le Chromium Playwright.
Depuis la racine :

```sh
cd tools/migration-probe
bun install --frozen-lockfile
bun run typecheck
bun run test:b2
# Facultatif si Chrome local n'est pas utilisé :
bunx playwright install chromium
# Chemin absolu vers le fichier local protégé déjà fourni, jamais une copie :
B2_PROBE_BROWSER_CHANNEL=chrome bun run probe:b2 --run --configure-cors \
  --env-file /absolute/path/to/nfe-webapp/.env.local
```

Sans `--run`, `bun run probe:b2` affiche **not_run**, ne contacte pas B2 et ne
réécrit pas la preuve locale. La CI compile le probe et teste les gardes sans
credentials ; son succès ne signifie jamais que le runtime B2 a été exécuté.
Ne pas définir `B2_PROBE_BROWSER_CHANNEL=chrome` pour utiliser le Chromium téléchargé.
Le suffixe `.pw.ts` du pilote évite toute collecte Playwright par `bun test` racine.

Le fichier d'environnement doit être gitignored et en mode `600`. Seules ces
six valeurs sont extraites en mémoire : `B2_APPLICATION_KEY_ID`,
`B2_APPLICATION_KEY`, `B2_BUCKET_ID`, `B2_BUCKET_NAME`, `B2_REGION`, `B2_ENDPOINT`.
Le harness refuse toute autre destination que ce bucket/région/endpoint ; la clé
large fournie reste exclusivement côté Bun. Il n'énumère jamais les autres buckets
et n'en crée aucun. Préférer une clé restreinte à ce bucket pour les futurs usages.

## Signatures et CORS

Le serveur temporaire écoute uniquement `127.0.0.1` sur un port libre attribué
par l'OS ; il n'arrête aucun autre service. Les signatures exigent un nonce de run,
l'origine locale exacte, un objet appartenant à une liste de quatre clés du run,
et pour les parties un uploadId détenu et un numéro 1 ou 2. Le corps est limité
à 2 Kio et le nombre de signatures à 40. Le navigateur reçoit des URLs temporaires,
jamais la clé générale. Le contrôle réel rejette un mauvais nonce (`403`), un objet
non détenu (`400`) et un autre uploadId (`400`) ; les tests couvrent aussi injection
de paramètres, action et numéro de partie invalides.

`--configure-cors` autorise seulement `http://localhost:<port>` et
`http://127.0.0.1:<port>`, plus les deux origines au port futur `3501`.
Méthodes `PUT/GET/HEAD`, headers `content-type/range`, exposition
`ETag/Content-Range/Accept-Ranges`, cache préflight nul. Pas de wildcard ni DELETE.
Le succès des `fetch` inter-origines et de la lecture dans le vrai navigateur
constitue la preuve CORS ; les appels Bun seuls ne suffiraient pas.

B2 renvoie `NoSuchCorsConfiguration` (404) pour la configuration absente,
et ne restitue pas l'ID de règle S3. Le harness compare donc la forme exacte de
sa règle locale et conserve les règles d'une autre forme. Il remplace sa propre
règle d'un run précédent pour éviter d'accumuler des ports. Les autres propriétés
natives du bucket sont comparées avant/après, sans modification d'ACL,
lifecycle, chiffrement ou rétention. CORS ne rend pas un bucket public :
voir [B2 CORS](https://www.backblaze.com/docs/cloud-storage-cross-origin-resource-sharing-rules)
et [PutBucketCors](https://www.backblaze.com/apidocs/s3-put-bucket-cors).
Le CORS local est volontairement conservé après le run.

## Volumes, coûts et nettoyage

Par run réussi, les fixtures utiles mesurées totalisent 10 663 418 octets.
Le rejeu et l'annulation portent les **payloads uploadés à 21 149 178 octets**
(20 Mio de parties + 4 096 octets + 173 562 octets de MP4). Le GET d'intégrité
multipart télécharge 10 Mio ; les petits GET et deux lectures MP4 s'y ajoutent.
Ces chiffres mesurent les payloads synthétiques, pas les octets réseau facturés
(TLS/XML, préflights et buffering vidéo ne sont pas instrumentés).

Budget conservateur pour un essai normal : < 32 Mio uploadés, < 64 Mio téléchargés,
moins d'une centaine d'appels HTTP attendus, SDK limité à deux tentatives par
opération et timeouts de connexion/requête de 10/20 s. Il n'y a ni boucle de charge
ni surveillance différée ; les listes sont limitées à 100 entrées et refusent
une pagination inattendue. Les attentes vidéo sont limitées à 15 s par événement.

[Tarifs publics consultés le 29 octobre 2026](https://www.backblaze.com/cloud-storage/pricing) :
6,95 USD/To/mois, premiers 10 Go gratuits, sortie gratuite jusqu'à 3× le stockage
mensuel moyen, puis 0,01 USD/Go ; classes A/B/C gratuites pour pay-as-you-go,
classe D à 0,004 USD/10 000 après quota gratuit. À titre de plafond indicatif
hors gratuité : 64 Mio de sortie ≈ **0,000672 USD**, 16 Mio conservés un mois
≈ **0,000117 USD** ; les fichiers sont en pratique immédiatement supprimés.
Ce n'est pas une mesure de facture ni une validation du contrat de ce compte.

Chaque exécution possède un préfixe UUID `nfe-migration-probe/…/` initialement vide.
Le `finally` ferme le navigateur/serveur, liste uniquement ce préfixe, annule
uniquement les uploadIds détenus et supprime explicitement chaque VersionId
ou delete marker des quatre clés détenues. Il vérifie ensuite zéro version et
zéro multipart. Une suppression sans VersionId laisserait des versions B2,
d'où l'utilisation de [ListObjectVersions](https://www.backblaze.com/apidocs/s3-list-object-versions).
Aucune version d'un autre run n'est supprimée ; le bucket reste privé et conservé.

Une erreur de nettoyage fait échouer le run et écrit `.local/b2-recovery.json`
ignoré en mode `600`, avec les seuls identifiants des ressources détenues.
Dans ce cas, transmettre ce fichier uniquement à l'opérateur autorisé pour
reprendre le nettoyage de ce préfixe et de ces uploadIds exacts : ne pas lancer
un nettoyage global du bucket. Un arrêt forcé du processus peut empêcher le
`finally` ; ne pas interrompre un run actif sauf nécessité. Les URLs présignées,
auth tokens, logs réseau, traces, screenshots et fixtures temporaires ne sont
jamais enregistrés dans la preuve publique.

## Limites qui restent ouvertes

- Pas d'auth métier Appwrite SSR ni de contrôle propriétaire/modération intégré
  Start : le nonce local n'est pas une implémentation de droits produit.
- B2 n'effectue ici aucun transcodage, miniature, optimisation Cloudinary ou CDN.
  La parité des transformations inventoriées reste une tranche distincte.
- Pas de Safari/iOS, appareil physique, réseau mobile réel, charge concurrente,
  failover, ni garantie de performance à partir de cette petite fixture.
- Aucun serveur Appwrite permanent/hébergement cible ni DB source représentative
  n'est disponible ; les gates correspondants de #43/#45 restent non prouvés.
- L'outil Appwrite existant, les routes métier, les dépendances racine et les
  exclusions TypeScript restent inchangés. Aucun déploiement de production.

## Vérifications de cette PR

- Copie temporaire du seul sous-package, `bun install --frozen-lockfile`,
  `bun run typecheck`, `bun run test:b2` : réussis, sans dépendances racine.
- `bun run typecheck` racine, avec `tools/migration-probe/node_modules`
  déplacé temporairement hors du checkout : réussi.
- `bun test` racine dans la même isolation : 12 tests, 27 assertions, aucun
  pilote Playwright collecté. Les gardes B2 ont aussi leur test dédié
  (10 assertions), exécuté séparément et en CI.
- `bun run lint` : réussi, cinq avertissements (quatre existants et un de
  complexité du handler local du probe), aucune erreur.
- `bun run build` racine avec les seules valeurs Resend/auth autorisées du
  fichier protégé chargées en mémoire, sans dépendances du probe : **exit 0**.
  La compilation et le typecheck passent ; l'erreur sitemap liée à la DB
  indisponible reste observée. Ce succès ne prouve pas les lectures DB produit.
  Un essai préalable sans configuration échouait sur les variables requises ;
  un essai synthétique ne sert pas de preuve d'environnement configuré.
- Contrôle complémentaire en lecture seule du seul bucket NFE après exécution :
  aucune version/delete marker et aucun multipart, donc bucket conservé vide.
