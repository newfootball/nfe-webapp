# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next Football Experience (NFE) - A football/soccer social media web application built with Next.js 15, TypeScript, and modern web technologies. Designed for players, coaches, recruiters, and clubs to share content, connect, and interact within the football community.

## Common Development Commands

### Quick Start
```bash
make sync    # Complete setup: clean, install, docker, migrate, seed, dev
make dev     # Start development server
make build   # Build for production
```

### Database Operations
```bash
make prisma-migrate    # Run database migrations
make prisma-seed       # Seed database with test data
make prisma-studio     # Open Prisma Studio GUI
make prisma-reset      # Reset database (caution!)
```

### Code Quality
```bash
make lint              # Run all linters (Biome, ESLint, Prisma)
make check             # Run linters and build
bun run lint           # Quick lint check
```

### Docker
```bash
make docker-up         # Start PostgreSQL container
make docker-down       # Stop containers
make docker-destroy    # Remove containers and volumes
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth v5 (beta) with Google OAuth
- **Styling**: Tailwind CSS + Shadcn/UI components
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Media**: Cloudinary for images/videos
- **Email**: Resend
- **i18n**: next-intl (English/French)

### Project Structure
```
/app/                 # Next.js App Router pages
  /(home)/           # Main app routes
  /(public)/         # Public pages
  /(private)/        # Protected routes
  /(auth)/           # Auth pages
/src/                # Shared application logic
  /actions/          # Server Actions for mutations
  /query/            # Database queries (centralized)
  /lib/              # Utilities and configs
  /hooks/            # Custom React hooks
/components/         # Reusable UI components
/prisma/            # Database schema and migrations
/messages/          # i18n translation files
```

### Key Patterns

1. **Server Components by Default**: Use client components only when needed (interactivity, hooks)
2. **Server Actions**: All form submissions and mutations use Server Actions in `/src/actions/`
3. **Query Pattern**: Database queries centralized in `/src/query/` files
4. **Schema Validation**: Use Zod schemas for all data validation
5. **Error Handling**: Server Actions return `{ error: string } | { success: true }`

### Database Models

Key entities:
- **User**: With roles (USER, ADMIN, PLAYER, COACH, RECRUITER, CLUB)
- **Post**: Content with states (DRAFT, PUBLISHED, PENDING, REJECTED)
- **PostAsset**: Media attachments (images/videos)
- **Like**, **Comment**, **Follow**, **Favorite**: Social features
- **Message**: User-to-user messaging
- **Signal**: Content moderation/reporting

### Authentication Flow

1. NextAuth configured with Prisma adapter
2. Supports credentials + Google OAuth
3. User onboarding flow after registration
4. Protected routes use middleware checks

### Form Handling Pattern

```typescript
// 1. Define Zod schema
const schema = z.object({ /* fields */ })

// 2. Create Server Action
export async function actionName(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: "Validation failed" }
  
  // Perform operation
  return { success: true }
}

// 3. Use in client component with useFormAction hook
```

### Environment Variables

Critical env vars (see `/src/lib/env.ts` for full list):
- `DATABASE_URL`: PostgreSQL connection
- `AUTH_SECRET`: NextAuth secret
- `GOOGLE_CLIENT_ID/SECRET`: OAuth
- `CLOUDINARY_*`: Media handling
- `RESEND_API_KEY`: Email service

### Testing Strategy

Currently no test suite configured. When adding tests:
- Use Vitest for unit tests
- Playwright for E2E tests
- Test Server Actions independently
- Mock Prisma client for database tests

### Common Tasks

**Adding a new page**:
1. Create route in appropriate `/app/` directory
2. Use layout from parent route group
3. Implement data fetching in Server Component
4. Add Server Actions for mutations

**Adding a new database model**:
1. Update `/prisma/schema.prisma`
2. Run `make prisma-migrate`
3. Create query functions in `/src/query/`
4. Create Server Actions in `/src/actions/`

**Adding a new UI component**:
1. Check if Shadcn/UI has it: `bunx shadcn@latest add [component]`
2. Otherwise create in `/components/` following existing patterns
3. Use Tailwind classes for styling

**Handling file uploads**:
1. Use Cloudinary integration
2. See existing patterns in post creation
3. Validate file types and sizes

### Performance Considerations

- Images: Use Next.js Image component with Cloudinary URLs
- Queries: Leverage Prisma's select/include for efficient queries
- Caching: React Query handles client-side caching
- Loading: Use Suspense boundaries for better UX

### Security Notes

- All user inputs validated with Zod
- Server Actions check authentication
- Database queries use Prisma (prevents SQL injection)
- File uploads validated and processed through Cloudinary
- Environment variables validated on startup

## Development Workflow Memories

- Avant de créer une pull request, lance la commande `make sync` pour remettre à zéro la base de données et l'environnement