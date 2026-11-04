# Répétition locale de la bascule — #65 (tranche LOCAL)

Répétition rejouable de la migration sur le runtime local persistant (#94 :
`nfe-local-runtime-64`, Appwrite 2.6.2 sur `127.0.0.1:18464`, Start sur
`127.0.0.1:3564`, projet `nfe-local`). Données synthétiques uniquement. Aucune
action préprod/prod, Coolify, DNS, OAuth ou e-mail. Preuve :
`tools/business-import/evidence/local-rehearsal.json` (exécution du 2026-11-04).

## Commande

```bash
# Prérequis : runtime #94 préparé (apps/start/.local-runtime), clés B2 dev dans
# .env.local (mode 600), ffmpeg + cwebp sur PATH, Chrome pour Playwright.
cd tools/business-import && bun install && PLAYWRIGHT_CHANNEL=chrome bun run rehearsal
```

Le script `tools/business-import/rehearsal.ts` n'ajoute que de l'orchestration :
il réutilise `apps/start/scripts/local-runtime*.ts` (lease, release, lancement),
les bibliothèques de `tools/business-import` (projection, upload, import,
nettoyage) et `tools/identity-import`. Chaque run écrit son dossier privé
`tools/business-import/.local/rehearsal-<uuid>/` (sauvegardes, journal serveur,
sorties Playwright, `evidence.json`) et affiche `{result, stage, evidence}`.

## Séquence et durées mesurées

| Étape | Ce qui est fait | Durée |
| --- | --- | --- |
| preflight | port 3564 libre, backend joignable, cibles absentes, préfixe B2 vide, release Start vérifiée | 11,0 s |
| backup | `compose stop` puis archive froide des 10 volumes (`--network none`, image redis), redémarrage | 10,7 s |
| freeze simulé | backend sans application entre l'arrêt et la fin de l'import | 112,9 s |
| import.schema | provisionnement des 7 schémas dans `nfe-local-rehearsal` | 62,3 s |
| import.identity + replay | 3 identités (admin bcrypt, passwordless, Google) ; replay `unchanged: 3` | 0,2 s |
| import.media (interrompu, complet, replay) | multipart interrompu puis repris ; 8 objets ; replay sans version supplémentaire | 35,2 s |
| import.rows + replay | 33 lignes sur 15 tables ; replay `resumed: 33` | 0,7 s |
| reconcile | comparaison projection/cible, identités présentes, base live intacte | 0,1 s |
| smoke | Start sur la base de répétition, matrice HTTP, Playwright FR/EN desktop + Pixel 7 | 8,5 s |
| acl | matrice anonyme/A/B/admin en lecture directe, écriture message directe refusée | 0,1 s |
| b2 | 5 cas d'échec | 3,7 s |
| rollback | nettoyage B2, restauration froide, redémarrage, vérifications live | 22,2 s (RTO) |

Total ~2 min 40 s. Le freeze est dominé par le provisionnement de schéma
(création de base + index Appwrite), pas par l'import lui-même.

## Couverture

1. **Sauvegarde / freeze / import / replay / réconciliation / smoke / rollback** :
   technique #47/#80 (archives froides par volume), idempotence prouvée sur les
   trois importeurs, rollback vérifié par absence de la base et des utilisateurs
   de répétition, état `local-player` identique au snapshot, pages live 200.
2. **Playwright sur le runtime intégré** : `apps/start/tests/rehearsal.pw.ts`
   via `playwright.rehearsal.config.ts`, FR + EN, `desktop-chrome` et
   `mobile-pixel-7` ; feed, profil importé, post publié avec lecteur en mode
   « indisponible », brouillon en 404 (même pour son auteur), `/private`,
   messages et notifications en session. Suites non exécutées et raisons dans
   `suitesNotRun` de la preuve (chaque suite existante possède sa propre stack
   jetable).
3. **ACL directes** : post publié lisible par tous, brouillon et profil privé
   réservés au propriétaire et à l'admin, messages réservés aux participants
   (aucun contournement admin), notification legacy (#19/#32 : `actorId` null,
   `source: legacy`) lisible par son seul destinataire, signalements non
   publics, asset média inaccessible à un tiers, écriture directe d'une ligne
   `messages` refusée (401), bornes `validateSendMessage` (#33).
4. **Cas B2** : objet manquant (`NoSuchKey`), upload interrompu (multipart en
   attente puis reprise et nettoyage), URL présignée expirée (401 côté B2),
   signature non transférable à une autre clé (403), préfixe étranger refusé
   (403), dépublication par suppression de version (404), lecteur Start sans
   clés B2 en mode « indisponible ».

## Limites constatées

- `/_local/ready` et le consommateur de notifications n'acceptent que
  `START_APPWRITE_DATABASE=nfe-local` : sur la base de répétition la readiness
  reste 503 et le consommateur sort. La preuve de service passe par
  `/_local/health` et le rendu réel des pages. En préprod réelle, les sondes et
  le consommateur doivent viser l'identifiant de base effectivement migré.
- L'allowlist importeur accepte désormais le projet `nfe-local` sur
  `127.0.0.1:18464` uniquement (tests unitaires ajoutés) ; les autres cibles
  restent refusées.
- Données synthétiques (3 utilisateurs, 2 posts, 4 médias, 33 lignes) : volumes
  réels, rattrapage figé et suppressions ne sont pas exercés ici.
- Une dérive réseau Docker du stack persistant a dû être réparée une fois avec
  `compose up --force-recreate` avant le premier run (volumes conservés).

## Go / no-go (ce run : GO pour la tranche locale)

| Critère | Résultat |
| --- | --- |
| Sauvegarde froide des 10 volumes avec empreintes, restauration vérifiée | OK |
| Import + replay sans doublon (identités, médias, lignes) | OK |
| Réconciliation projection/cible sur 15 tables, base live intacte | OK |
| Start sert les données importées FR/EN, desktop et mobile | OK |
| Matrice ACL et comportements notifications/messages | OK |
| Cas d'échec B2 | OK |
| Rollback complet, préfixe B2 vide, ports libérés, backend laissé tel que trouvé | OK |
| Readiness/consommateur sur la base cible | NON exercé (verrou `nfe-local`) |

## Reste à faire pour une préprod réelle (hors #65 LOCAL)

- Source réelle en lecture seule, volumes réels, mesure du freeze et du RTO à
  l'échelle, rattrapage figé et suppressions (#63 gates).
- Sondes de readiness et consommateur pointés sur la base migrée, pas sur
  `nfe-local`.
- Exécution des suites Playwright existantes contre l'environnement cible, Google
  OAuth, e-mails et lecture B2 réelle dans Start.
- Déploiement, DNS, Coolify et bascule de production : décisions séparées.
