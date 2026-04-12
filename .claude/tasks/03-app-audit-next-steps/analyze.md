# Task: App Audit — Écrans existants & Next Steps

_Date: 2026-04-11_

---

## Codebase Context

### Ce qui est déjà construit

#### Authentification (complet ✅)
- `/sign-in` — Email/password + Google OAuth
- `/sign-up` — Inscription avec validation Zod
- `/forgot-password` / `/reset-password` — Réinitialisation par email (Resend)

#### Onboarding (complet ✅)
- `/onboarding` — Flow multi-étapes : sélection rôle → complétion profil (position, pied, club, etc.)
- `onboarding.action.ts` — Mapping enum POSITION_MAP + gestion Foot BOTH

#### Feed & Posts (complet ✅)
- `/` — Feed Instagram-style avec infinite scroll (cursor-based), squelettes de chargement
- `/post/[id]` — Vue post complète (vidéo, likes, commentaires, signalement)
- `/post/new` — Création de post avec upload Cloudinary (video + thumbnail)
- `/post/my` — Mes posts
- `/post/[id]/edit` — Édition titre/description (avec vérification propriété)

#### Interactions sociales (complet ✅)
- Like, commentaire (avec suppression), partage, favori (bookmark)
- Follow/unfollow (avec guard anti-self-follow)
- Notifications (like, commentaire, follow) → `src/lib/create-notification.ts`

#### Profil (partiellement complet ⚠️)
- `/profile` — Affiche derniers posts + posts likés
- `/profile/edit-user` — Édition email, nom, biographie
- `/profile/change-password` — Changement de mot de passe
- `/profile/favorites` — Posts sauvegardés (3-col grid)
- `/user/[id]` — Profil public utilisateur

#### Messagerie (complet ✅)
- `/messages` — Liste des conversations
- `/messages/[user_id]` — DM 1-on-1

#### Notifications (complet ✅)
- Bell avec badge dans le header (polling 30s)
- `/notifications` — Centre de notifications avec temps relatif

#### Explore/Search (complet ✅)
- `/explore` — Recherche utilisateurs + posts avec debounce 400ms, tabs
- Tabs: Top, Users, Hashtags, Events, Posts (⚠️ hashtags/events = vides, voir ci-dessous)

#### Admin (partiel ⚠️)
- `/admin` — Dashboard admin
- `/admin/users` — Liste paginée des utilisateurs
- ⚠️ MANQUE: UI de modération pour les posts signalés (PostSignal)

#### SEO Programmatique (complet ✅)
- `/[userType]` — Pages par type (player, coach, recruiter, club)
- `/players/[position]` — Pages par position (11 positions)
- `/players/city/[city]` — Pages par ville

#### Pages statiques (complet ✅)
- `/about-us`, `/privacy`, `/terms` — Traduites EN + FR

---

## Gaps Identifiés

### 🔴 BUGS / LIENS MORTS

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| 1 | Lien `/contact` mort dans about-us | `about-us/page.tsx` | UX cassée |
| 2 | Tabs "Hashtags" et "Events" dans Explore → vides | `explore/page.tsx` | Confusion utilisateur |

### 🟠 FONCTIONNALITÉS INCOMPLÈTES

| # | Manque | Détail | Fichiers concernés |
|---|--------|--------|--------------------|
| 3 | **Modération admin**: PostSignal model complet (PENDING/REVIEWED/DISMISSED, raison, etc.) mais AUCUNE UI admin pour lire/traiter les signalements | DB: `PostSignal`, `SignalReason`, `SignalStatus` | `app/(home)/(private)/admin/` |
| 4 | **Champs profil non affichés**: DB a `birthday`, `fullName`, `gender`, `localisation`, `size`, `weight`, `license`, `contract` mais le profil n'affiche que `name`, `biography` | `components/feature/user/user-profile.tsx` | profil + edit-user |
| 5 | **Statut post invisible**: Posts peuvent être DRAFT/PENDING/REJECTED mais l'utilisateur ne voit aucun indicateur de statut sur `/post/my` | `src/query/post.query.ts` | `post/my/page.tsx` |
| 6 | **Suggestions d'utilisateurs**: Composant `user-suggestions.tsx` existe mais n'est affiché nulle part | `components/feature/user/user-suggestions.tsx` | layout feed ? |
| 7 | **Type "shortVideo"**: MediaType a `shortVideo` mais pas d'UI dédiée (pas de feed Reels) | `prisma/schema.prisma` | — |
| 8 | **Post spamScore**: Champ `spamScore` (NONE/SUSPECT/SPAM) en DB mais jamais utilisé dans l'UI admin | — | admin |
| 9 | **ExpiresAt post**: Champ `expiresAt` existe mais pas de logique d'expiration | — | — |

### 🟡 FEATURES MANQUANTES (pertinentes pour MVP football)

| # | Feature | Priorité | Justification |
|---|---------|----------|---------------|
| 10 | **Hashtag support** (basic) | P1 | Tabs déjà dans l'UI, besoin d'un model `Hashtag` + parsing des posts |
| 11 | **Indicateur de complétion du profil** | P1 | Les recruteurs filtrent sur profils complets ; UX engagement |
| 12 | **Page de contact** (`/contact`) | P1 | Lien mort dans about-us |
| 13 | **Push notifications (web push)** | P2 | Aujourd'hui = polling 30s ; insuffisant |
| 14 | **Filtres avancés explore** | P2 | Chercher par position, pied, ville |
| 15 | **Messagerie de groupe** | P2 | Coach → équipe |

---

## Key Files

### Routes à corriger / compléter
- `app/(home)/(public)/about-us/page.tsx` — Lien `/contact` mort (L: contact button)
- `app/(home)/(public)/explore/page.tsx` — Tabs hashtags/events → rien à afficher
- `app/(home)/(public)/explore/explore-header.tsx` — Tabs à masquer ou implémenter
- `app/(home)/(private)/post/my/page.tsx` — Statut posts non affiché
- `app/(home)/(private)/admin/` — Manque page modération signalements

### Profil
- `components/feature/user/user-profile.tsx` — N'affiche pas : localisation, age, position, pied, taille, poids
- `app/(home)/(private)/profile/edit-user/page.tsx` — N'édite que : name, email, biography

### DB (déjà présent, pas d'UI)
- `prisma/schema.prisma` — Model `PostSignal` complet mais sans UI admin
- `prisma/schema.prisma` — Champs `User.size`, `weight`, `license`, `contract`, `birthday`, `fullName`, `gender`, `localisation`

### Actions existantes non exploitées
- `src/actions/post.action.ts` — `reportPost` existe, mais pas d'UI admin pour y répondre
- `components/feature/user/user-suggestions.tsx` — Composant prêt, jamais utilisé

---

## Patterns à Suivre

- **Server Actions**: `"use server"` dans `src/actions/`, retournent `{ success, error }`
- **Queries**: `"use server"` dans `src/query/`, userId résolu depuis session
- **Auth guard**: `getUserSessionId()` avant toute mutation
- **i18n**: `getTranslations()` serveur, `useTranslations()` client — toujours ajouter clés EN + FR
- **Tailwind**: tokens sémantiques (pas de couleurs hardcodées), `shrink-0` pas `flex-shrink-0`
- **Admin guard**: Layout `app/(home)/(private)/admin/layout.tsx` vérifie `role === "ADMIN"`
- **PostSignal workflow**: créer via `reportPost()` → lire dans admin → `PENDING → REVIEWED/DISMISSED`

---

## Next Steps Priorisés

### Sprint 1 — Bugs & Quick Wins (1-2 jours)

| Priorité | Tâche | Complexité |
|----------|-------|-----------|
| 🔴 P0 | Corriger lien `/contact` dans about-us (→ mailto ou page simple) | XS |
| 🔴 P0 | Masquer/désactiver tabs Hashtags et Events dans Explore (ou message "coming soon") | XS |
| 🟠 P1 | Afficher statuts DRAFT/PENDING/REJECTED sur `/post/my` avec badge coloré | S |
| 🟠 P1 | Profil : afficher champs manquants (position, pied, localisation, âge) | S |
| 🟠 P1 | Profil edit : permettre édition localisation, position, pied, birthday | M |

### Sprint 2 — Admin Modération (2-3 jours)

| Priorité | Tâche | Complexité |
|----------|-------|-----------|
| 🟠 P1 | Page `/admin/signals` — liste posts signalés (PostSignal) | M |
| 🟠 P1 | Actions admin : approuver (keep) / rejeter (REJECTED) un post signalé | M |
| 🟠 P1 | Badge rouge dans header admin si signalements en attente | S |

### Sprint 3 — Complétion produit (3-5 jours)

| Priorité | Tâche | Complexité |
|----------|-------|-----------|
| 🟡 P2 | Page `/contact` simple (formulaire → Resend) | S |
| 🟡 P2 | User suggestions sur le feed (composant existe, à intégrer) | S |
| 🟡 P2 | Indicateur de complétion du profil (% de champs remplis) | M |
| 🟡 P2 | Filtres explore : par position, par type d'utilisateur, par ville | M |
| 🟡 P2 | Hashtag support basique (#tag dans description → cliquable → explore?q=%23tag) | L |

### Sprint 4 — Engagement (future)

- Web push notifications (service worker)
- Feed algorithmique (trending, for you)
- Messagerie de groupe
- Analytics profil (vues, portée posts)

---

## Dependencies

- **No schema migration needed** pour Sprint 1 (champs existent déjà)
- **Sprint 2** : PostSignal déjà en DB avec index ; query `getSignals()` à créer
- **Sprint 3 hashtags** : nécessite ajout model `Hashtag` + migration Prisma
- **Contact page** : Resend déjà configuré, pattern email dans `resend.md`
