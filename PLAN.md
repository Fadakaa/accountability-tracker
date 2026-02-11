# Implementation Plan — All 5 Features

---

## Feature 1: Tree Auto-Branching (Hybrid Approach)

### Problem
The Skill Tree has hardcoded branch-to-habit mappings in `buildSkillTree()`. New habits can never appear on the tree. Habits without `HABIT_LEVELS` entries are invisible.

### Solution
Data-driven branches with keyword auto-suggestion + user overrides.

### Step 1.1: Data Model (`src/lib/store.ts`)

Add `treeBranch` to `HabitOverride`:
```ts
export interface HabitOverride {
  // ... existing fields ...
  treeBranch?: string;  // "spiritual" | "physical" | "mind" | "environment" | custom
}
```

Add branch definitions to `UserSettings`:
```ts
export interface TreeBranchDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  isDefault: boolean;
}

export interface UserSettings {
  // ... existing fields ...
  treeBranches?: TreeBranchDef[];
}
```

Default branches:
```ts
const DEFAULT_TREE_BRANCHES: TreeBranchDef[] = [
  { id: "spiritual",   name: "Spiritual",   icon: "🙏", color: "#a78bfa", isDefault: true },
  { id: "physical",    name: "Physical",    icon: "💪", color: "#f97316", isDefault: true },
  { id: "mind",        name: "Mind",        icon: "🧠", color: "#3b82f6", isDefault: true },
  { id: "environment", name: "Environment", icon: "🏠", color: "#22c55e", isDefault: true },
];
```

### Step 1.2: Keyword Heuristics (`src/lib/treeBranches.ts` — new file)

```ts
const BRANCH_KEYWORDS: Record<string, string[]> = {
  spiritual:   ["pray", "bible", "faith", "church", "meditat", "worship", "devotion", "scripture", "nsdr", "yoga nidra"],
  physical:    ["train", "gym", "run", "cold", "stretch", "exercise", "walk", "swim", "bjj", "martial", "push-up", "plank", "rpe"],
  mind:        ["read", "journal", "deep work", "focus", "study", "learn", "write", "keystone", "book", "pages"],
  environment: ["tidy", "clean", "chore", "organiz", "environment", "space", "home", "room"],
};

export function suggestBranch(habitName: string, habitSlug: string): string { ... }
export function getHabitBranch(habit: Habit, settings: UserSettings): string { ... }
```

### Step 1.3: Refactor `buildSkillTree()` (`src/app/tree/page.tsx`)

Replace hardcoded branch arrays with dynamic builder that:
- Reads branch assignments from `getHabitBranch()`
- Habits WITH `HABIT_LEVELS` → show Lv.1–4 progression nodes (same as today)
- Habits WITHOUT `HABIT_LEVELS` → show a single "Active" placeholder node
- "New Growth" (🌱 yellow) fallback branch at bottom for unmapped habits
- Empty non-default branches are hidden

### Step 1.4: Branch Picker in Settings (`src/app/settings/page.tsx`)

Add branch selector in `HabitSettingsRow` expanded controls (same UI pattern as the stack selector):
```
[Branch]
[🙏 Spiritual] [💪 Physical] [🧠 Mind] [🏠 Environment]
```

Writes to `settings.habitOverrides[habitId].treeBranch`.

### Files Changed
| File | Change |
|------|--------|
| `src/lib/store.ts` | Add `treeBranch` to `HabitOverride`, add `TreeBranchDef`, add `treeBranches` to `UserSettings` |
| `src/lib/treeBranches.ts` | **NEW** — keyword heuristics, `suggestBranch()`, `getHabitBranch()` |
| `src/app/tree/page.tsx` | Refactor `buildSkillTree()` to data-driven, handle single-node habits, "New Growth" branch |
| `src/app/settings/page.tsx` | Add branch picker to `HabitSettingsRow` |

---

## Feature 2: Push Notifications Fix

### Current State
Client-side notification infrastructure is **comprehensive** (408 lines in `src/lib/notifications.ts`):
- Service worker (`public/sw.js`) handles push display + click routing
- PWA manifest with standalone mode + icons
- 3x daily scheduler (morning/midday/evening) based on `checkinTimes`
- Fibonacci escalation engine (13→8→5→3→1→1 min intervals) on "Later"
- Auto-miss after 30 min no response
- 11 PM end-of-day warning + midnight auto-miss
- `NotificationBanner` component for permission prompts
- All client-side via `setInterval` every 60s

### Problem (likely)
Notifications only fire while the tab is open — the `setInterval` scheduler in `notifications.ts` requires the app to be running. No server-side push means:
- Close the tab → no reminders
- Phone locked → no notifications
- Background tab → unreliable timing

### Solution: Web Push with VAPID Keys

#### Step 2.1: Generate VAPID keys + API route
Create `src/app/api/push/route.ts`:
- POST `/api/push/subscribe` — stores push subscription
- POST `/api/push/send` — sends a push to stored subscription
- Uses `web-push` npm package with VAPID keys in env vars

#### Step 2.2: Subscribe on permission grant
In `notifications.ts`, after `Notification.requestPermission()`:
- Get `PushSubscription` from service worker registration
- POST it to `/api/push/subscribe`
- Store subscription in localStorage as backup

#### Step 2.3: Scheduled push via cron / edge function
Option A (simple): Keep client-side scheduler as primary, use server push as fallback
Option B (robust): Use Vercel Cron or Supabase Edge Function to trigger pushes at check-in times

**Recommended**: Option A for now — the client scheduler works when app is open, and we add a lightweight server fallback for closed-tab scenarios.

#### Step 2.4: Update service worker
Already handles push events. May need to add:
- Subscription refresh on activation
- Better payload parsing for scheduled vs escalation notifications

### Files Changed
| File | Change |
|------|--------|
| `src/app/api/push/route.ts` | **NEW** — VAPID push subscription + send endpoint |
| `src/lib/notifications.ts` | Add `subscribeToPush()`, integrate with existing scheduler |
| `public/sw.js` | Minor updates for subscription refresh |
| `package.json` | Add `web-push` dependency |
| `.env.local` | VAPID public/private keys |

---

## Feature 3: Day Completed Lock Screen

### Current State
After check-in submission, the result screen shows:
- XP earned (animated pulse)
- Bare minimum status (met/not met)
- Up to 4 streak updates
- Motivational quote
- Two buttons: "Dashboard" and "Log More"

There is **no celebration screen** when ALL habits for the entire day are done. The system treats each stack submission independently.

### Solution: Full-Day Completion Screen

#### Step 3.1: Detect full-day completion (`src/lib/dayComplete.ts` — new file)

```ts
export function isDayFullyComplete(state: LocalState): boolean {
  const todayLog = getTodayLog(state);
  if (!todayLog) return false;
  const activeHabits = getResolvedHabits().filter(h => h.is_active);
  // All binary habits answered (done or missed — not unanswered)
  // All measured habits have a value
  // All bad habits logged
  return allBinaryAnswered && allMeasuredLogged && allBadLogged;
}

export function isDayPerfect(state: LocalState): boolean {
  // All binary = done, all bad = clean, bare minimum met
}
```

#### Step 3.2: Lock screen component (`src/components/DayCompleteScreen.tsx` — new file)

Triggered when `isDayFullyComplete()` returns true after a check-in submission.

**Design:**
- Full-screen overlay with dark backdrop
- Animated tree/plant growing (CSS animation)
- "Day Complete" title with date
- Stats summary: X/Y habits done, streak count, XP earned today
- If perfect day: gold border + "Perfect Day" badge + confetti-style particles
- If bare minimum only: green border + "Minimum Met" message
- Motivational quote (contextual — `getContextualQuote("streak_milestone")`)
- Single dismiss button: "Rest well" / "Back to Dashboard"
- Auto-dismiss option: fade after 10 seconds

#### Step 3.3: Integration in check-in flow (`src/app/checkin/page.tsx`)

After `handleSubmit()` → check `isDayFullyComplete(newState)`:
- If true → show `DayCompleteScreen` instead of the normal result screen
- If false → show normal result screen (stack not fully done yet)

#### Step 3.4: Dashboard awareness (`src/app/page.tsx`)

If today is fully complete, show a subtle "Day Complete ✓" badge in the header and disable the check-in button (or change it to "Review Today").

### Files Changed
| File | Change |
|------|--------|
| `src/lib/dayComplete.ts` | **NEW** — `isDayFullyComplete()`, `isDayPerfect()` |
| `src/components/DayCompleteScreen.tsx` | **NEW** — full-screen celebration component |
| `src/app/checkin/page.tsx` | Show lock screen when day is fully done |
| `src/app/page.tsx` | Show "Day Complete" state on dashboard |

---

## Feature 4: History Loss Prevention

### Current State
- DayLog entries are stored as `Record<string, { status, value }>` keyed by **habit ID**
- When a habit is deactivated: historical logs are preserved (good), but the habit disappears from all views (bad)
- There's **no way to view past entries** for deactivated habits
- If you change a habit's stack or bare minimum status, past XP is NOT recalculated (correct), but analytics may miscount

### Problems
1. Deactivated habits vanish from insights/weekly views — you lose visibility into past data
2. No warning when deactivating a habit with a long streak
3. No "archive" concept — deactivation feels like deletion to the user

### Solution

#### Step 4.1: Show deactivated habits in history views

In `src/app/insights/page.tsx` and `src/app/weekly/page.tsx`:
- When rendering historical data, use **all habits** (active + inactive) that appear in the log entries, not just `getResolvedHabits().filter(h => h.is_active)`
- Add a helper: `getHabitsWithHistory(logs: DayLog[]): Habit[]` that returns all habits that have at least one log entry, even if inactive

#### Step 4.2: Deactivation warning in Settings

In `src/app/settings/page.tsx`, before deactivating a habit:
- Check if it has an active streak > 0
- If yes, show a confirmation: "This habit has a X-day streak. Deactivating will pause tracking but your history is preserved. Continue?"
- Streak is frozen (not deleted) — can be resumed on reactivation

#### Step 4.3: "Archived" section in insights

Add a collapsible "Archived Habits" section at the bottom of the insights page showing:
- Deactivated habits that have historical entries
- Their final streak count
- Total days tracked
- Option to reactivate

### Files Changed
| File | Change |
|------|--------|
| `src/app/insights/page.tsx` | Include inactive habits with history in analytics |
| `src/app/weekly/page.tsx` | Include inactive habits with history in weekly view |
| `src/app/settings/page.tsx` | Add deactivation warning with streak info |
| `src/lib/resolvedHabits.ts` | Add `getHabitsWithHistory()` helper |

---

## Feature 5: Updating Measured Values

### Current State
- Measured values are entered during check-in and saved to `DayLog.entries[habitId].value`
- Multiple check-ins per day merge via `Object.assign()` — later values overwrite earlier ones for the same habit
- There is **no way to edit** a value after leaving the result screen
- No edit button, no history page with edit capability

### Solution: Edit mode on daily log entries

#### Step 5.1: Edit log page (`src/app/edit-log/page.tsx` — new file)

Accessible from:
- Dashboard → tap on a day in the weekly dots
- Weekly page → tap on a specific day
- Insights → tap on a data point

**UI:**
- Shows all logged entries for the selected date
- Binary habits: toggle status (done/missed) — with XP recalculation warning
- Measured habits: editable number input (same UI as check-in)
- Bad habits: toggle occurred, edit duration
- Save button recalculates XP for that day and updates `DayLog`

#### Step 5.2: XP recalculation on edit

When an entry is edited:
```ts
function recalculateDayXP(log: DayLog): number {
  // Re-run the same XP logic from check-in submission
  // Returns new xpEarned for the day
}
```
- Diff the old and new XP: `state.totalXp += (newXP - oldXP)`
- Update level if XP changed significantly
- Show the delta: "+15 XP" or "-10 XP"

#### Step 5.3: Quick-edit measured values from dashboard

On the dashboard progress rings or the weekly page, add a pencil icon next to measured totals:
- Tap → inline edit → save
- Lightweight alternative to the full edit page for quick corrections

#### Step 5.4: Edit audit trail (optional)

Store edits with timestamp so the user knows what changed:
```ts
interface EditRecord {
  date: string;
  habitId: string;
  oldValue: number | null;
  newValue: number | null;
  editedAt: string;
}
```
Added to `LocalState.editHistory?: EditRecord[]`

### Files Changed
| File | Change |
|------|--------|
| `src/app/edit-log/page.tsx` | **NEW** — full day log editor |
| `src/lib/store.ts` | Add `recalculateDayXP()`, add `editHistory` to `LocalState` |
| `src/app/page.tsx` | Add tap-to-edit on daily view elements |
| `src/app/weekly/page.tsx` | Add tap-to-edit on day entries |

---

## Implementation Priority

| # | Feature | Complexity | Impact | Order |
|---|---------|-----------|--------|-------|
| 1 | Tree Auto-Branching | Medium | High | 1st |
| 2 | Updating Measured Values | Medium | High | 2nd |
| 3 | Day Completed Lock Screen | Low-Medium | Medium | 3rd |
| 4 | History Loss Prevention | Low | Medium | 4th |
| 5 | Push Notifications | High | High | 5th |

**Rationale:**
- Tree auto-branching is the feature you wanted to explore first — ship it first
- Measured value editing is a daily pain point — high impact, moderate effort
- Day complete screen is a satisfying UX win with relatively contained scope
- History loss prevention is mostly about showing existing data better — low risk
- Push notifications require server infrastructure (VAPID, API routes) — save for last

---

## Total New Files

| File | Feature |
|------|---------|
| `src/lib/treeBranches.ts` | Tree auto-branching |
| `src/lib/dayComplete.ts` | Day completion detection |
| `src/components/DayCompleteScreen.tsx` | Day completion UI |
| `src/app/edit-log/page.tsx` | Measured value editing |
| `src/app/api/push/route.ts` | Push notification server |

## Total Modified Files

| File | Features |
|------|----------|
| `src/lib/store.ts` | Tree branching + Measured editing |
| `src/app/tree/page.tsx` | Tree auto-branching |
| `src/app/settings/page.tsx` | Tree branching + History loss |
| `src/app/checkin/page.tsx` | Day complete screen |
| `src/app/page.tsx` | Day complete + Measured editing |
| `src/app/insights/page.tsx` | History loss prevention |
| `src/app/weekly/page.tsx` | History loss + Measured editing |
| `src/lib/resolvedHabits.ts` | History loss prevention |
| `src/lib/notifications.ts` | Push notifications |
| `public/sw.js` | Push notifications |
| `package.json` | Push notifications |
