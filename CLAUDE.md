# Accountability Tracker — CLAUDE.md

## Rules for AI Agents

- **Before finishing ANY task, run `npm test` and `npm run build`. Do not consider work complete if either fails.**
- If you modify a function that has tests, update the tests to match. If you add new business logic, add tests for it.
- Do not change the visual design without explicit approval
- Do not rearrange the dashboard layout
- Always explore the codebase before writing code
- Preserve all existing user data — never drop tables or clear state
- Test on mobile viewport — this is a PWA used primarily on phone
- One feature at a time — no scope creep
- If uncertain, ask rather than assume
- Match existing code patterns and style

---

## 1. Project Overview

**What**: Solo-user accountability tracker PWA with habit stacking, XP/leveling, streaks, AI coaching, gym logging, sprint mode, and admin task management.

**Live URL**: https://accountability-tracker-sandy.vercel.app

**Tech Stack**:
- Next.js 16 (App Router) + React 19
- Tailwind CSS v4 (`@theme` block, no tailwind.config)
- Supabase (auth, Postgres, RLS)
- TypeScript (strict)
- Capacitor 8 (iOS/Android native wrapping)
- PostCSS with `@tailwindcss/postcss`

**Purpose**: Daily habit check-in system with morning/midday/evening stacks, gamification (XP, levels, streaks), bad habit tracking, AI-powered coaching, and sprint-based task management.

---

## 2. Architecture & Folder Structure

```
accountability-tracker/
├── CLAUDE.md
├── package.json
├── next.config.ts          # Conditional static export for Capacitor
├── postcss.config.mjs
├── tsconfig.json
├── capacitor.config.ts     # iOS/Android native config
├── vercel.json             # Cron job config
├── .env.local              # Supabase + ntfy + cron secrets
├── supabase/
│   ├── schema.sql          # Full DB schema (17 tables)
│   ├── seed.sql            # Default habits + user profile
│   ├── migrations/         # Supabase migrations
│   └── NUKE_AND_REBUILD.sql
├── public/
│   ├── manifest.json       # PWA manifest
│   ├── sw.js               # Service worker (cache + push)
│   ├── favicon.svg
│   └── icons/              # PWA icons
└── src/
    ├── app/                # Next.js App Router pages
    │   ├── layout.tsx      # Root layout (AuthProvider, ClientProviders)
    │   ├── page.tsx        # Dashboard (XP bar, rings, streaks, quick actions)
    │   ├── globals.css     # Tailwind v4 @theme + PWA styles
    │   ├── checkin/        # Check-in flow (stack-based cards)
    │   ├── admin/          # Task management (today + backlog)
    │   ├── settings/       # Full settings (habits, AI, notifications, sync)
    │   ├── coach/          # AI coach chat interface
    │   ├── insights/       # Analytics and data visualisations
    │   ├── weekly/         # Weekly summary view
    │   ├── gym/            # Gym session logging
    │   ├── sprint/         # Sprint mode (tasks + deadlines)
    │   ├── tree/           # Skill tree visualisation
    │   ├── routine/        # Routine chain builder
    │   ├── wrap/           # Period wrap-up summaries
    │   ├── edit-log/       # Edit past check-in entries
    │   ├── onboarding/     # New user onboarding
    │   ├── login/          # PIN-based auth
    │   └── api/
    │       ├── coach/chat/ # AI coach API route (multi-provider)
    │       ├── notify/     # Push notification endpoints
    │       │   ├── test/
    │       │   ├── escalate/
    │       │   └── sync-schedule/
    │       └── cron/notify/ # Vercel cron for scheduled notifications
    ├── components/
    │   ├── AuthProvider.tsx          # Supabase auth context
    │   ├── AuthGuard.tsx             # Route protection
    │   ├── ClientProviders.tsx       # Client-side providers wrapper
    │   ├── NotificationBanner.tsx    # Notification permission prompt
    │   ├── VoiceInput.tsx            # Voice-to-text input
    │   ├── LevelSuggestionBanner.tsx # Level-up suggestions
    │   ├── CapacitorLinkInterceptor.tsx
    │   └── charts/                   # SVG chart components
    │       ├── HeatMap.tsx
    │       ├── LineChart.tsx
    │       ├── BarChart.tsx
    │       ├── DonutChart.tsx
    │       └── WeeklyTable.tsx
    ├── hooks/
    │   └── useDB.ts        # React hook bridging localStorage ↔ Supabase
    ├── lib/
    │   ├── store.ts        # localStorage state (check-ins, admin, XP, streaks, gym, settings)
    │   ├── db.ts           # Supabase CRUD (save/load state, settings, habits)
    │   ├── supabase.ts     # Supabase client initialisation
    │   ├── habits.ts       # Static habit definitions + DEFAULT_QUOTES
    │   ├── resolvedHabits.ts # Merge static habits + user overrides (DB or localStorage)
    │   ├── habitCrud.ts    # Habit CRUD operations
    │   ├── completion.ts   # Completion rate calculations
    │   ├── schedule.ts     # Stack time boundaries + scheduling
    │   ├── notifications.ts # Browser push + Fibonacci escalation engine
    │   ├── nativeNotifications.ts # Capacitor native notifications
    │   ├── analytics.ts    # Analytics calculations
    │   ├── weakness.ts     # Weakness detection
    │   ├── adaptive.ts     # Adaptive difficulty
    │   ├── api.ts          # API helper functions
    │   ├── treeBranches.ts # Skill tree data
    │   ├── capacitorUtils.ts # Capacitor platform helpers
    │   ├── coach/
    │   │   ├── prompts.ts       # AI coach system prompts
    │   │   ├── context.ts       # Compressed data context builder (~500-800 tokens)
    │   │   ├── providers.ts     # Multi-provider AI (Anthropic/OpenAI/Google)
    │   │   ├── conversations.ts # Coach conversation storage
    │   │   └── experiments.ts   # A/B testing for coach prompts
    │   └── sync/
    │       ├── queue.ts         # Offline sync queue
    │       ├── online.ts        # Online sync orchestration
    │       ├── transforms.ts    # Data transforms for sync
    │       ├── types.ts         # Sync type definitions
    │       └── migration.ts     # Data migration helpers
    └── types/
        └── database.ts    # Core types (Habit, HabitStack, HabitCategory, LogStatus, etc.)
```

### Data Flow

```
User Action → Page Component → store.ts (localStorage) → useDB hook → db.ts (Supabase)
                                    ↑                          ↓
                              resolvedHabits.ts         sync/queue.ts (offline queue)
                              (merge static + overrides)
```

- Components read from `useDB()` hook which returns `{ state, settings, habits }` from localStorage
- Writes go to `store.ts` functions (e.g., `saveState`, `saveSettings`)
- When online + authenticated, `useDB` also syncs to Supabase via `db.ts`
- Offline writes queue in `sync/queue.ts` for later replay

---

## 3. State Management

**Primary store**: `localStorage` via `src/lib/store.ts`

**Storage keys** (all prefixed `accountability-`):
| Key | Contents |
|-----|----------|
| `accountability-tracker` | Main state: logs, XP, streaks, level |
| `accountability-settings` | User settings: habit overrides, custom habits, routine chains, AI config, quotes |
| `accountability-admin` | Admin tasks (today + backlog) |
| `accountability-gym` | Gym session logs |
| `accountability-gym-routines` | Saved gym routines |
| `accountability-deferred` | Temporarily deferred habits (auto-clears daily) |
| `accountability-showing-up` | "Showing Up" streak data |
| `accountability-notifications` | Notification state |
| `accountability-sync-queue` | Offline sync queue |

**Source of truth**: localStorage is primary, Supabase is cloud backup.

**Dual-state risk**: Data lives in both localStorage and Supabase. The `useDB` hook attempts to keep them in sync, but race conditions on mount/navigation can cause data loss. This is a known bug area.

**Key types** (from `src/types/database.ts`):
- `Habit`: id, name, slug, category, stack, is_bare_minimum, unit, icon, sort_order, is_active, current_level
- `HabitStack`: `'morning' | 'midday' | 'evening'`
- `HabitCategory`: `'binary' | 'measured' | 'bad' | 'manual-skill'`
- `LogStatus`: `'done' | 'missed' | 'later' | 'skipped'`

---

## 4. Supabase Schema

**Connection**: `src/lib/supabase.ts` creates a singleton client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**User ID**: `00000000-0000-0000-0000-000000000001` (hardcoded solo user in seed.sql)

**Tables** (17 total):

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `user_profile` | Solo user profile | id, pin_hash, timezone |
| `habits` | Habit definitions | id, user_id, name, slug, category, stack, is_bare_minimum, sort_order, is_active, current_level |
| `habit_levels` | Level descriptions per habit | habit_id, level, label, description |
| `daily_logs` | One entry per habit per day | habit_id, log_date, status (done/missed/later/skipped), value |
| `bad_habit_logs` | Bad habit occurrences | habit_id, log_date, occurred, duration_minutes |
| `streaks` | Per-habit streak tracking | habit_id, current_count, longest_count, shield_available |
| `bare_minimum_streak` | Overall bare-minimum streak | current_count, longest_count |
| `xp_ledger` | XP transaction log | amount, reason, earned_at |
| `user_xp` | Current XP/level summary | total_xp, current_level |
| `levels` | Level definitions (1-15) | level, title, xp_required |
| `sprints` | Sprint mode sessions | name, intensity, status, start_date, deadline |
| `sprint_tasks` | Sprint subtasks (nested) | sprint_id, parent_task_id, title, is_completed |
| `targets` | Weekly/monthly targets | metric, period, target_value |
| `reviews` | Period reviews/reflections | review_type, period_start, period_end |
| `review_responses` | Review answers | review_id, question, answer |
| `escalations` | Notification escalation state | habit_id, status, escalation_step |
| `motivational_quotes` | User-managed quotes | quote, is_active |
| `gym_sessions` | Gym log entries | session_date, training_type, muscle_group, rpe |
| `gym_exercises` | Exercises in a session | session_id, exercise_name |
| `gym_sets` | Sets per exercise | exercise_id, weight_kg, reps, is_failure |
| `notification_settings` | Notification channel config | channel, is_enabled, destination |
| `checkin_schedule` | Stack check-in times | stack, checkin_time |
| `badges` | Achievement definitions | slug, name, description, category |
| `user_badges` | Earned badges | user_id, badge_id, earned_at |

**RLS**: Enabled on all tables with permissive "Allow all for authenticated" policies.

**Custom Enums**: `habit_category`, `habit_stack`, `log_status`, `sprint_intensity`, `sprint_status`, `target_period`, `review_type`, `notification_channel`, `escalation_status`, `training_type`

---

## 5. Key Features & Where They Live

| Feature | Primary File(s) |
|---------|----------------|
| Dashboard | `src/app/page.tsx` |
| Check-in system | `src/app/checkin/page.tsx` |
| Habit tracking (binary + measured) | `src/lib/habits.ts`, `src/lib/resolvedHabits.ts`, `src/lib/habitCrud.ts` |
| Bad habit tracking | Integrated in check-in + `src/lib/completion.ts` |
| XP / Levels / Streaks | `src/lib/store.ts` (recalculateStreaks, getLevelForXP) |
| Skill tree | `src/app/tree/page.tsx`, `src/lib/treeBranches.ts` |
| Gym log | `src/app/gym/page.tsx`, store.ts (gym storage keys) |
| Admin tasks / backlog | `src/app/admin/page.tsx`, `src/lib/store.ts` (AdminTask functions) |
| Sprint Mode | `src/app/sprint/page.tsx` |
| Notifications | `src/lib/notifications.ts` (browser), `src/lib/nativeNotifications.ts` (Capacitor), `src/app/api/notify/` |
| Fibonacci escalation | `src/lib/notifications.ts` (escalation engine) |
| Coach / AI feedback | `src/app/coach/page.tsx`, `src/lib/coach/` (prompts, context, providers, conversations) |
| Settings | `src/app/settings/page.tsx` (~2100 lines — habits, AI, notifications, sync, quotes, reset) |
| Insights / Analytics | `src/app/insights/page.tsx`, `src/lib/analytics.ts`, `src/lib/completion.ts` |
| Weekly summary | `src/app/weekly/page.tsx` |
| Routine chains | `src/app/routine/page.tsx`, `src/lib/resolvedHabits.ts` (chain ordering) |
| Edit past logs | `src/app/edit-log/page.tsx` |
| Data sync | `src/lib/sync/`, `src/hooks/useDB.ts`, `src/lib/db.ts` |
| Onboarding | `src/app/onboarding/page.tsx` |
| Auth (PIN-based) | `src/app/login/page.tsx`, `src/components/AuthProvider.tsx`, `src/components/AuthGuard.tsx` |
| Voice input | `src/components/VoiceInput.tsx` |
| Charts | `src/components/charts/` (HeatMap, LineChart, BarChart, DonutChart, WeeklyTable) |

---

## 6. Design Language & UI Conventions

**Theme** (defined in `src/app/globals.css` via `@theme`):
```css
--color-brand: #f97316;        /* Orange accent */
--color-brand-light: #fb923c;
--color-brand-dark: #ea580c;
--color-surface-900: #0a0a0f;  /* Base background */
--color-surface-800: #12121a;  /* Card backgrounds */
--color-surface-700: #1a1a2e;  /* Elevated surfaces */
--color-surface-600: #222236;
--color-surface-500: #2a2a3e;
--color-done: #22c55e;         /* Green = completed */
--color-missed: #ef4444;       /* Red = missed */
--color-later: #f59e0b;        /* Amber = deferred */
--color-streak: #f97316;       /* Orange = active streak */
--color-bad: #dc2626;          /* Red = bad habit */
```

**Conventions**:
- Dark mobile-first theme, body text `#f5f5f5`
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Skull emoji for dead/broken streaks
- Green for active/current states, muted/gray for locked/inactive
- Cards use `surface-800` background with `surface-700` borders
- No component library — all custom with Tailwind utility classes
- Icons are emoji-based (no icon library)
- Responsive via Tailwind breakpoints, mobile-first layout
- PWA standalone mode with safe-area-inset handling
- `touch-action: manipulation` on all interactive elements for 300ms tap delay fix

---

## 7. Code Style & Patterns

- **Language**: TypeScript (strict mode)
- **Files**: kebab-case for files (`resolved-habits.ts` style, though some use camelCase like `resolvedHabits.ts`)
- **Components**: PascalCase for component files and names
- **Functions**: camelCase, exported from service modules
- **Types**: Defined in `src/types/database.ts`, imported with `@/types/` path alias
- **Path alias**: `@/` maps to `src/`
- **API calls**: Next.js API routes in `src/app/api/`, called via `fetch` or `src/lib/api.ts`
- **State access**: Always through `store.ts` functions (`loadState`, `saveState`, `loadSettings`, etc.)
- **Error handling**: Try/catch with silent fallbacks to defaults (returns `[]` or `{}` on parse failure)
- **No component library**: Everything is hand-built with Tailwind classes
- **Inline styles**: Minimal — Tailwind utility classes preferred
- **Server components**: Minimal use — most pages are client-side (`'use client'`)

---

## 8. Environment Variables

| Variable | Context | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Supabase anonymous key |
| `NTFY_TOPIC` | Server only | ntfy.sh push notification topic |
| `CRON_SECRET` | Server only | Vercel cron job auth |
| `NEXT_PUBLIC_APP_URL` | Client + Server | App base URL for notification links |

---

## 9. Known Issues

1. **Admin data self-deletes** — Admin tasks stored in `accountability-admin` localStorage key are cleared unexpectedly. Likely related to `clearAllLocalData()` being called on auth state changes or `saveAllAdminTasks()` race conditions.

2. **Cloud sync broken** — Supabase upload/download in settings (`DataSyncSection`) has stopped working. May be related to `useDB` hook, `db.ts` save functions, or auth state not being ready when sync is triggered.

3. **Backlog wipe** — Task backlog occasionally completely cleared. Could share root cause with #1 — `saveAllAdminTasks()` might be called with an empty array during component mount before data loads.

4. **Coach doesn't understand app mechanics** — AI coach assumes 7-day active weeks and judges against standards that don't match actual usage patterns. Coach context builder in `src/lib/coach/context.ts` needs app-awareness improvements.

5. **Voice recording broken on mobile** — `src/components/VoiceInput.tsx` may have browser compatibility issues.

6. **Dashboard "Next check-in" time mismatch** — Time displayed doesn't match settings check-in times. Logic in `src/lib/schedule.ts` may not be reading user-configured times correctly.

---

## 10. Build & Deploy

```bash
# Run tests (REQUIRED before completing any task)
npm test

# Dev server
npm run dev

# Production build (REQUIRED before completing any task)
npm run build

# Capacitor (iOS)
npm run cap:ios     # builds static export + syncs + opens Xcode

# Capacitor (Android)
npm run cap:android
```

**Testing**: Vitest with happy-dom. Tests live in `src/lib/__tests__/`. Run `npm test` to execute all tests, `npm run test:watch` for watch mode. Tests cover: completion stats, analytics, streaks/XP/levels, scheduling, habits, weakness detection.

**Deployment**: Vercel (auto-deploy from git)
- `vercel.json` configures a cron job at `/api/cron/notify` (every 15 minutes)
- Static export mode available for Capacitor via `CAPACITOR_BUILD=true`

**Node requirement**: Node.js at `/usr/local/bin/node` — set `PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"` before running npm commands.
