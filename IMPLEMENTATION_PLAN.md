# Levain — Full Feature Implementation Plan (rev. 2, post-Codex review)

Roadmap for all 11 gap-analysis enhancements, ordered so each stage compiles,
ships independently to the device, and builds on prior stages. Headings map to
the original gap-analysis item numbers (1–11). Revised after a read-only Codex
review; corrections from that review are folded in and marked where they changed
scope.

**Stack & conventions (verified):**
- React 19 + TS + Vite + Dexie (IndexedDB) + Zustand. Local-first, metric-first;
  Capacitor (Android/iOS).
- Dexie schema in `src/lib/db.ts` (`version(1)`). **Only bump `db.version(2)`
  when adding/removing a store, changing an index, or doing a structured
  `.upgrade()` backfill.** Adding plain optional object fields (e.g.
  `discardGrams`, `averagePeakTime`) needs **no** version change — avoid schema
  churn. `activeTimelines.status` is already indexed.
- **Settings are NOT in Dexie.** They persist via Zustand `persist` to
  `localStorage` key `levain-settings` (`settingsStore.ts`). Any backup/restore
  must treat that key as a first-class data source.
- **Photos are NOT base64 in records.** `photos.ts` writes via
  `Filesystem.writeFile` to `Directory.Data` and stores file paths/URIs (web can
  yield temporary `webPath`s). Portable backups must embed the image bytes, not
  the URIs.
- Navigation: `appStore` `navigateTo(page, data)` / `openModal(modal, data)`.
  `PageType` includes an **unused `'bake-detail'`** (never rendered in `App.tsx`).
- Modals: `BottomSheet` + segmented-list (see EditStarterModal). Reuse
  `fermentation.ts`, `storage.ts`, `photos.ts`, and the Claude/on-device analyzer
  pattern (`claude.ts` + `starterVision.ts`).
- Per stage: `npx tsc -b` clean; **no new** eslint errors (3 pre-existing
  tolerated); `npm run build` green; verify in Playwright at 390×844; deploy
  in-place (preserves data).

**Verified current state (corrected after review):**
- Export EXISTS (`handleExportData`, Settings.tsx) but: omits `activeTimelines`,
  omits localStorage settings correctness (exports the in-memory `settings`
  object, not the persisted source of truth), uses web `<a>.click()` (unreliable
  on Capacitor), embeds photo **URIs not bytes**, and has **no import**.
- `averagePeakTime` is NEVER written (renders `--`). `healthScore` IS written by
  starter photo analysis (so it's not dead — Stage 2 adds a *behavioral*
  contribution, distinct from the photo score).
- Manual bake logging **already exists** (shallow) via `StartBakeModal` →
  `db.bakes.add` with process/baking/results, plus a Book "Log Bake" button.
  Missing: photos, tags, recipe link, and a detail/edit page. (Corrected: this
  is an *upgrade*, not a new build.)
- Bakes from `createBakeFromTimeline` use hardcoded placeholder process/oven
  values. Journal card press only `console.log`s — no detail view.
- `CrumbAnalysis` typed; no crumb analysis flow exists.
- **Multiple active timelines are already creatable with no guard**
  (Calculator.tsx, PlanBakeModal.tsx both `add({status:'active'})`), but Home /
  ActiveBakePage / `getActiveTimeline` only read `.first()` → **stranded,
  inaccessible active bakes today**. (Corrected: current bug, not just a feature.)
- Notification IDs are fragile: feeding reminders hash UUIDs into only ~900 IDs
  (collision-prone across starters); timeline bases use `Date.now()`; the
  Android persistent bake notification is a single fixed ID.
- `discard` category appears as a recipe filter but is never surfaced from the
  feeding flow.
- `syncEnabled`/`syncUrl`/`syncedAt` are dead types (not in UI). The **offline
  banner falsely promises** "Changes will sync when connected" (App.tsx).
- Book search covers **recipes only**; journal has only a favorites filter
  despite `tags: string[]` existing on bakes.
- No i18n library; strings hardcoded English.

---

## Stage 0: Timeline-integrity fix + notification-ID redesign (MUST-FIX foundation)
**Why first (new, per review):** the app can already strand active timelines, and
the notification ID scheme is collision-prone. Both are latent bugs that every
later timeline/reminder/multi-bake stage would compound. Fix the foundation
before building on it.

**Goal:** No inaccessible active bakes; a collision-free notification ID scheme.

**Tasks:**
- Centralize a notification-ID allocator in `notifications.ts`: dedicated,
  non-overlapping ranges (persistent / feeding reminders / per-timeline bases);
  derive per-timeline bases deterministically (store on the timeline) instead of
  `Date.now()`; replace the 900-bucket UUID hash for feeding reminders with a
  stable per-starter ID that cannot collide across starters.
- Add a guard or surfacing for multiple active timelines: at minimum,
  `getActiveTimelines()` (plural) and make Home/ActiveBakePage able to reach all
  active rows so none are stranded. (Full multi-bake UX is Stage 6; this stage
  just guarantees none are lost.)
- Migrate existing scheduled notifications safely (cancel-and-reschedule on app
  start if the ID scheme changed).

**Build-time notes (from review, to pin down here, not roadmap blockers):**
- Do NOT derive finite integer IDs by hashing UUIDs — persist allocated numeric
  IDs (a registry on the entity/settings) so they provably can't collide.
- "Existing reminders survive upgrade" must be reconstructable from app data
  (lastFed + location + settings); verify against already-scheduled *native*
  notifications, since those can't be read back richly — prefer
  cancel-all-then-rebuild-from-data on first launch after the scheme change.

**Success criteria:** Two active timelines are both reachable; no two entities can
be assigned the same notification ID; existing reminders survive the upgrade.

**Tests:** create 2 active timelines → both reachable; 50 starters → unique
reminder IDs; upgrade path reschedules without duplicate/dropped notifications.

**Status:** Complete — `src/lib/notificationIds.ts` owns partitioned, persisted
ID allocation (feeding reminders sequential from 100; timeline blocks from
100_000); `Date.now()` bases and the uuid-hash removed; `getActiveTimelines()`
added and Home/ActiveBakePage reach all active timelines by id; starter delete
cancels+releases its reminder; one-shot `migrateNotificationScheme()` cancels
stale notifications and App rebuilds feeding reminders from data. Verified in
browser (feeding → id:100; two timelines both reachable independently).

---

## Stage 1: Data safety — robust backup + restore (item 1) + settings honesty (item 11)
**Why second:** app is 100% local; a wipe or lost phone loses everything. Close
the loss hole before adding more data worth protecting. Folded settings/sync
honesty in here (per review) because backup and settings ownership are coupled.
Split into 1a/1b/1c (review: Stage 1 as written was too large).

### Stage 1a — Export (correct + complete)
- `src/lib/backup.ts` `exportAllData()`: include `starters`, `feedings`,
  `recipes`, `bakes`, **`activeTimelines`**, and the **persisted `levain-settings`
  from localStorage** (read the storage key, not the live object). Stamp
  `schemaVersion`, `appVersion`, `exportDate`.
- **Photo strategy (MUST-FIX):** resolve photo URIs to bytes and embed
  (base64) for portability, OR offer a "data only (no photos)" option; warn on
  large exports. Document that URI-only backups are not portable across installs.
- Native-safe write/share via `@capacitor/filesystem` + `@capacitor/share`
  (already deps); define exactly *where* the file is written and that it's shared
  then optionally cleaned up. Web fallback to `<a>.click()`.
- Replace the false offline banner copy and remove dead `syncEnabled`/`syncUrl`
  types (or repurpose as "backup reminders" built on this stage). Add a "Last
  backup" line + "Back up now" in Settings → Data.

### Stage 1b — Import (merge)
- `importAllData(json, 'merge')`: validate shape + `schemaVersion` first; **revive
  Date strings** consistently for IndexedDB + date-fns; rehydrate embedded photo
  bytes back to `Directory.Data` files and rewrite URIs. Upsert by `uuid`
  (recipes also respect `slug`). File picker + merge confirm via `ConfirmModal`.

### Stage 1c — Import (replace, transactional)
- `importAllData(json, 'replace')`: validate fully, stage all writes, then run a
  **single Dexie transaction across all tables**; only clear localStorage settings
  *after* the DB import succeeds. Decide policy: restore active timelines as
  **paused** to avoid resurrecting stale notifications (then let the user resume).
- **Build-time note (from review):** a Dexie transaction covers IndexedDB but NOT
  filesystem photo writes or localStorage. Define explicit ordering + cleanup:
  write photos to a temp location first, commit the DB transaction, then promote
  photos and write settings; on any failure, delete temp photo files so a failed
  import leaves no orphaned files.

**Success criteria:** Export on device yields a portable file (photos included or
explicitly excluded); merge import restores all entities + settings + photos with
no duplicates; replace import is atomic (a failure leaves existing data intact);
no false sync messaging remains.

**Tests:** export→delete-all→import = identical counts incl. timelines + settings;
photos display after import on a fresh install; merge of overlapping file → no
dup uuids/slugs; replace failure mid-way → original data preserved; old/corrupt
file → rejected with toast.

**Status:** Complete — `src/lib/backup.ts` exports all Dexie tables + Dexie
internal counters + localStorage user settings; photos embedded as data: URIs
(opt-out toggle), remote URLs kept as-is, rehydrated to device files on native
import. Replace = single Dexie transaction (atomic), settings applied only after
DB success, active timelines restored paused; merge upserts by uuid (+slug for
recipes). `parseBackup` validates app/version/shape and revives Dates. Native
share via Filesystem+Share, web `<a>` fallback; file-picker import. Offline
banner corrected; dead `syncEnabled`/`syncUrl` settings removed. Verified in
browser: round-trip counts match exactly; merge idempotent (no dups); dates
revived; validation rejects bad/old/non-Levain files; photos (data: + remote)
survive; timelines come back paused. tsc+build clean, zero new lint errors.

---

## Stage 2: Starter insights — compute stats from feedings (item 2)
**Why third:** pure logic over data already collected; no new screens; feeds Stage
8's smart defaults. Independent of Stage 1.

**Goal:** Derive real metrics instead of always-`--` placeholders.

**Tasks:**
- `src/lib/starterStats.ts`: from `feedings[]` compute `averagePeakTime` (mean of
  `peakTime − timestamp` where both exist), feeding frequency, and a
  **behavioral** health contribution (recency + consistency + peak reliability),
  combined with — not overwriting — the photo-analysis `healthScore`. Normalize
  peaks by ambient temp (`getTemperatureMultiplier`).
- **Single source of truth (per review):** compute in one place; recompute on
  feeding log and persist, and recompute on StarterDetail load to self-heal
  stale values. Avoid two divergent writers.
- StarterDetail: real stat tiles; peak-time sparkline (recharts, a dep) at ≥3
  feedings.

**Success criteria:** A starter with feedings shows a real avg peak and a health
score responsive to recency/consistency; no `--` when data exists; no stale
divergence between the two writers.

**Tests:** known set → expected average; 0–2 feedings → graceful empty; temp
normalization moves the number correctly; re-open page → value stable.

**Status:** Complete — `src/lib/starterStats.ts` computes temp-normalized
averagePeakTime, median feeding interval, and a behavioral activityScore (kept
separate from the photo healthScore so the two writers don't clobber).
`recomputeStarterStats` in db.ts is the single write path (called on feeding log
and StarterDetail load to self-heal). StarterDetail shows real tiles (Health /
Avg Peak / Activity), a cadence caption, a "Mark peak now" capture action (the
feeding form has no peak input), and a recharts "Time to peak" sparkline at ≥3
peaks. Verified in browser: ref-temp avg 6h; 31°C→12h and 15°C→3h normalization;
0–2 feedings graceful; mark-peak adds a sample and updates the average. tsc+build
clean, zero new lint errors. (Benign recharts first-paint width(-1) dev warning.)

---

## Stage 3: Upgrade bake logging + bake detail/edit (item 3)
**Why fourth:** `StartBakeModal` already logs bakes (shallow); the gap is depth +
a detail view. Split 3a/3b (review: too large as one). Claims the unused
`'bake-detail'` PageType.

### Stage 3a — Bake detail (read) + de-hardcode conversion
- `BakeDetailPage` rendering the full `Bake` record; wire `'bake-detail'` in
  `App.tsx`; journal cards open it (replace the `console.log`).
- Refactor `createBakeFromTimeline` to carry real timeline/recipe values; fall
  back only when genuinely unknown.

### Stage 3b — Full capture (photos, tags, recipe link, edit)
- Extend `StartBakeModal` (or a fuller `LogBakeModal`) and BakeDetail edit:
  photos (via `photos.ts`), `tags`, optional recipe link (prefill ingredients
  from baker's %), and the full `BakeResults` ratings. Edit existing bakes.

**Success criteria:** User logs a past bake with ratings + photos + tags + recipe
link; it opens in a detail view and is editable; timeline bakes no longer show
fabricated 245°C/4h defaults.

**Tests:** full bake persists/reopens/edits; recipe-linked bake prefills
ingredients; journal stats include all bakes.

**Status:** Complete — new `BakeDetailPage` (claims the unused `'bake-detail'`
route) renders the full record: ingredients, per-dimension result ratings,
process, baking, notes, tags, photo gallery. Journal cards navigate to it
(replacing the console.log). `createBakeFromTimeline` no longer fabricates
process/oven values — it zeroes them and sets `processKnown`/`bakingKnown` false,
and the detail shows "Not recorded" instead. New `EditBakeModal` captures
everything (date, recipe link with ingredient prefill, starter link, ingredients,
all ratings, photos via photos.ts, tags, process/baking) and flips the known
flags when filled; StartBakeModal sets the flags honestly. Verified in browser:
timeline bake shows "Not recorded" (no fabricated 245°C); edit adds tag +
process and the detail live-updates; round-trip persists. tsc+build clean, zero
new lint errors.

---

## Stage 4: Crumb & dough photo analysis (item 4)
**Why fifth:** high-wow; a crumb shot belongs on a bake record (depends on Stage
3). `CrumbAnalysis` typed; starter analysis is the proven pattern.

**Goal:** Analyze a crumb/dough photo; attach to a bake.

**Tasks:**
- `analyzeCrumb(base64, ctx)` in `claude.ts` → `CrumbAnalysis`
  (openness/evenness/fermentation/gluten + under/good/over). On-device heuristic
  fallback in `starterVision.ts` style for the no-key path.
- From BakeDetail/LogBake: "Analyze crumb" → store on the bake; render scores +
  verdict + suggestions matching the starter analysis card. Reuse `photos.ts`,
  `MissingApiKeyError`, source labeling.

**Success criteria:** With a key → structured feedback saved to the bake; without
a key → on-device estimate offline; UI mirrors the starter card.

**Tests:** key → Claude path; no key → on-device, no crash; persists + survives
reload.

**Status:** Complete — `analyzeCrumb` in claude.ts returns a CrumbAnalysis
(openness/evenness/fermentation/gluten + under/good/over verdict) via the same
Haiku vision + JSON-schema pattern as the starter analyzer. New
`src/lib/crumbVision.ts` is the offline fallback, reusing the shared (now
exported) `extractSignals`. Added optional `crumbAnalysis` to the Bake type.
BakeDetail has an "Analyze crumb" ActionSheet (camera/gallery × on-device/Claude,
Claude options gated on an API key), stores the result on the bake, and renders a
card mirroring the starter analysis card (scores, proofing badge, observations,
suggestions, on-device/confidence footer). Verified in browser: on-device path
runs offline and differentiates open vs tight crumb (tight → "under-proofed");
result persists; card renders; Claude options hidden without a key. tsc+build
clean, zero new lint errors.

---

## Stage 5: Journal search & tag filtering (item 7, part 1)
**Why sixth:** depends on Stage 3 (tags must be capturable). Small; split from
comparison (review). Mirrors the existing recipe-search pattern in `Book.tsx`.

**Goal:** Find and filter bakes.

**Tasks:**
- Search (name/notes/tags) + tag-chip filter on Book → Journal, reusing the
  recipe-search code path.

**Success criteria:** Journal searches and tag-filters correctly.

**Tests:** search matches name/notes/tags; tag filter narrows; empty states ok.

**Status:** Complete — Book journal now has a search box (matches name/notes/tags)
and a tag-chip filter row (union of all bake tags), mirroring the recipe-search
pattern. `filteredBakes` derives client-side from the loaded bakes; a distinct
"No matching bakes" empty state (with Clear filters) is shown when filters hide
everything, separate from the "No bakes logged yet" first-run state. Verified in
browser: "rye" → only Rye; "chewy" (notes-only) → only Pizza; weekend tag →
Pizza+Country not Rye; no-match shows the matching empty state; clear restores
all. tsc+build clean, zero new lint errors.

---

## Stage 6: Multi-bake UX + bake comparison (item 5 + item 7, part 2)
**Why seventh:** builds the *UX* on Stage 0's integrity fix; comparison reuses
Stage 3 data and Stage 5 selection. Grouped because both are "work with several
bakes/timelines at once."

**Goal:** Run/monitor multiple timelines comfortably; compare finished bakes.

**Tasks:**
- Home: list/stack of active timelines (Stage 0 made them reachable);
  ActiveBakePage accepts `timelineId`; per-timeline notifications already isolated
  by Stage 0. Android persistent notification summarizes N active bakes.
- "Compare bakes": select 2+ from the (now searchable) journal → side-by-side
  ingredients/process/results with differences highlighted.

**Success criteria:** Two timelines run + are individually controllable;
completing one leaves the other intact; comparing two bakes shows aligned fields
and flags differences.

**Tests:** 2 timelines → correct independent notifications; cancel one → other
intact; persistent notification reflects count; comparison aligns 2 bakes.

**Status:** Complete — most multi-timeline UX landed in Stage 0 (Home lists all
active bakes, ActiveBakePage opens one by id, persistent slot cleared only when
the last bake ends). 6a: `showPersistentBakeNotification(name, activeCount)` now
summarizes ("3 bakes in progress"); all callers pass the live count. 6b: new
`BakeComparePage` (`bake-compare` route) shows ingredients/process/results
side-by-side with only differing rows highlighted; the journal has a Compare
mode (toggle → select cards with rings → "Compare N bakes" bar). Verified in
browser: count=3 → "3 bakes in progress"; selecting two bakes opens the
comparison with exactly the differing rows (hydration, oven, overall) highlighted.
tsc+build clean, zero new lint errors.

---

## Stage 7: Discard tracking & discard-recipe surfacing (item 6)
**Why eighth:** self-contained, high-utility; independent. Adds a plain optional
field (no schema bump).

**Goal:** Make discard actionable from feeding.

**Tasks:**
- FeedingModal: when a ratio implies discard, show estimated grams + "Save
  discard"; track running `discardGrams` on the starter (plain optional field).
- Contextual "Use your discard" prompt → `discard` category in Book; show total
  on StarterDetail; optional Home suggestion past a threshold.

**Success criteria:** Logging discard updates the total and offers discard recipes
one tap away; total resets when used.

**Tests:** correct grams; prompt navigates to filtered discard recipes; resets.

**Status:** Complete — added `discardGrams` to Starter (plain optional field, no
schema bump) with `addStarterDiscard`/`resetStarterDiscard` helpers. FeedingModal
has an optional discard input in advanced options, defaulted from the previous
feeding's flour+water, accumulated on log. StarterDetail shows a discard card
(running total) and, at ≥100 g, a "Discard recipes" + "Used it" prompt. Deep-link
via a new one-shot `bookIntent` in appStore (`openBookAtCategory`) that BookPage
reads as initial state → Recipes tab at the Discard category. Verified in browser:
60+80 → 140 g; prompt shows at threshold; "Discard recipes" lands on Book →
Recipes → Discard; reset clears to 0. tsc+build clean, zero new lint errors.

---

## Stage 8: Starter-centric feed planner — "feed so it peaks by T" (item 8)
**Why ninth:** reuses Stage 2 stats + reverse-calculator math; personalized once
stats exist.

**Goal:** Recommend when/what ratio to feed so the starter peaks by a chosen time.

**Tasks:**
- `planStarterFeed(targetPeakTime, ambientTemp, starterStats)` (in
  `fermentation.ts` or `starterPlanner.ts`): pick ratio + feed time from the
  ratio→peak table, adjusted by temp + measured `averagePeakTime`.
- StarterDetail "Plan a feed" → target time → ratio + feed time + optional
  reminder (reuse scheduler; respect Stage 0 ID scheme). Reconcile with the dough
  reverse-calculator to avoid double-notify.

**Success criteria:** "peak by Sat 18:00" → ratio + feed time consistent with
history + kitchen temp; can set a reminder.

**Tests:** warmer → earlier/shorter; fast measured peak → looser ratio; reminder
schedules correctly.

**Status:** Complete — `src/lib/starterPlanner.ts` `planStarterFeed(targetPeak,
ambientTemp, avgPeakHours?)` picks the gentlest fitting ratio from the exported
STARTER_PEAK_TIMES table, temp-adjusted via getTemperatureMultiplier and
personalized by the starter's measured averagePeakTime; returns ratio, feed time,
and a status (ok/feed_now/too_soon/past). New PlanFeedModal on StarterDetail
("Plan a feed") shows the recommendation and sets an optional one-off reminder at
the feed time via `schedulePlannedFeedReminder` (own ID range 2_000_000+ in
notificationIds, distinct from the recurring reminder, so no double-notify).
Verified in browser: 10h/23°C→1:5:5; 31°C→4h peak (feed later); 15°C→1:2:2;
measured 12h→1:3:3 personalized; 2h→feed_now; past→past. Modal renders the plan.
tsc+build clean, zero new lint errors.

---

## Stage 9: Accessibility pass (item 10, part 1)
**Why tenth:** can be incremental and earlier than full i18n (review). Pulled
ahead of string externalization because icon-only labels are quick wins.

**Goal:** A11y baseline on core flows.

**Tasks:**
- `aria-label`s on icon-only buttons (TabBar, modal headers, toggles), focus
  order in modals, contrast checks, ≥44px touch targets where missing.

**Success criteria:** Icon-only controls have accessible names; keyboard/focus
works in modals; no critical contrast failures on core flows.

**Tests:** screen-reader labels present; focus traversal in modals; contrast
audit passes on Home/Starters/Book.

**Status:** Complete — audited every interactive control (two Explore passes over
pages + modals). Added accessible names to all icon-only controls: Home settings,
StarterDetail edit/delete, BakeDetail edit/delete + favorite toggle, RecipeDetail
edit/delete/fork + favorite toggle, the `NumberInput` +/− steppers (`Input.tsx`),
EditBakeModal photo/tag add+remove, Add/EditRecipeModal photo/flour/addition/step
remove buttons. Favorite/star controls are now real toggles (`aria-pressed` +
state-aware label, e.g. "Add to favorites" ↔ "Remove from favorites"). The three
star-rating widgets (ActiveBakePage, StartBakeModal, EditBakeModal `StarPicker`)
became labeled `role="group"`s with per-star `aria-label`/`aria-pressed` and
`aria-hidden` on the decorative `<Star>`; `StarPicker` takes a `label` prop so each
reads "Crust: 3 stars" etc. The Recipes grid favorite badge is `role="img"
aria-label="Favorite"`. Shared dialogs (`Modal`, `BottomSheet`) now carry
`role="dialog"`, `aria-modal="true"`, and `aria-labelledby` tied to the title via
`useId`; `Modal`'s close button got `aria-label="Close"`. `BottomSheet` gained an
Escape-to-close handler (previously dismissible only by drag/overlay — no keyboard
path). Verified live with Playwright at 390×844: Home 0 unnamed buttons; the
"Add New Starter" sheet exposes `role=dialog`/`aria-modal`/`aria-labelledby`→
heading with 0 unnamed of its 11 buttons; Escape closes it. tsc clean, build
green, eslint unchanged (25 problems, all pre-existing — zero new, proven via
`git stash` baseline diff).

**Status:** Complete

---

## Stage 10: Internationalization (item 10, part 2)
**Why eleventh:** broad, cross-cutting; cheapest once the feature set is stable so
strings are extracted once. EU context (metric, Danish recipes) makes it
plausible.

**Goal:** Externalized strings + a second locale scaffold.

**Tasks:**
- Minimal i18n layer (smallest fit for Capacitor — `react-i18next` or an in-house
  dictionary); extract user-facing strings to an `en` catalog; scaffold `da`.
- Locale setting; keep number/temp/time formatting metric-first.

**Success criteria:** UI renders from a catalog; switching locale changes copy;
formatting stays metric-first.

**Tests:** locale switch updates copy app-wide; no missing-key fallbacks on core
screens.

**Status:** Complete — in-house i18n layer in `src/lib/i18n/` (NO new dependency,
per the "don't add tools" guideline): `en.ts` is the typed source of truth (996
keys) and defines `TranslationKey`, so every `t('…')` is compile-checked and a
missing key is a build error; `da.ts` is a full Danish catalog (996 keys, parity)
that falls back to `en` per key. `index.ts` exposes `translate()` with `{var}`
interpolation + `LANGUAGES`; `useTranslation()` binds `t` to the `language` slice
of the settings store so a locale change re-renders reactively (no reload).
`format.ts` keeps date/time/number formatting locale-aware but METRIC-FIRST —
switching language never changes units (°C/g stay). Added `language: 'en' | 'da'`
to `UserSettings` (default en) + a Settings selector showing native names.
Extraction was a parallel fan-out: a Workflow ran 21 agents (one per page/modal),
each replacing strings with `t('<namespace>.<key>')` in its own file and RETURNING
its catalog entries; the orchestrator merged all 940 returned keys centrally into
en.ts/da.ts (serialized to avoid write conflicts) — 0 collisions, 0 used-but-
undefined after merge (every `t()` call resolves). Foundation surfaces (TabBar,
App offline/skip, Home, Onboarding) wired by hand first to prove the mechanism.
Verified live with Playwright (390×844): Home/Calculator/Starters/Book all render
Danish on switch (e.g. "Beregnere", "Hvornår vil du have brød?", "Køkkentemperatur"),
0 raw-key leaks on any page, metric units preserved, English restores cleanly.
tsc clean, build green, eslint unchanged (zero new — proven via `git stash`
baseline). Data-derived strings (recipe names, fermentation-engine step text) and
native date/time inputs are intentionally left to their own sources.

**Status:** Complete

---

## Stage 11: First-run onboarding (item 9)
**Why last:** frames features that must already exist; benefits from Stage 1
(import), Stage 1's settings honesty, and Stage 9/10 (a11y/i18n). Reuses the
`PermissionPrompt` first-launch pattern.

**Goal:** Guide a new user to create/import their first starter and grasp the app.

**Tasks:**
- 3–4 step onboarding (`BottomSheet`/`Modal` + framer-motion), shown once via a
  persisted flag (`@capacitor/preferences`, alongside `hasShownPermissionPrompt`).
- Steps: welcome → create **or import** a starter (hands to Stage 1) → kitchen
  temp + reminder prefs → quick tour. Deep-link empty states into add-modals.

**Success criteria:** Fresh install reaches a created/imported starter + correct
reminder settings; never reappears after completion.

**Tests:** first launch shows it; completion sets flag; relaunch skips; "import
instead" hands off to Stage 1.

**Status:** Complete — `src/components/Onboarding.tsx` is a 4-step full-screen
first-run flow (welcome → name-your-starter → kitchen temp + reminders → quick
tour), with framer-motion step transitions and a labeled `role="dialog"` overlay.
Step 2 creates the starter inline via the same `db.starters.add` shape as
AddStarterModal (reuses its segmented flour-list pattern); an empty name turns the
CTA into "Skip for now" so the step is optional. Step 3 writes `defaultAmbientTemp`
+ `feedingRemindersEnabled` to settings and requests notification permission when
reminders are on — so onboarding subsumes the standalone `PermissionPrompt` for new
users. Persistence follows the EXISTING convention (localStorage), not the plan's
`@capacitor/preferences` guess: `permissions.ts` gains `hasCompletedOnboarding()` /
`markOnboardingComplete()` (the latter also sets `permission_prompt_shown` so the
bare prompt can't fire right after). App.tsx first-launch effect now shows
onboarding when `!hasCompletedOnboarding()`, else falls back to the bare
PermissionPrompt for pre-onboarding users (no retroactive onboarding). "I already
have a backup — import it" marks complete, closes, and switches to the Settings tab
where Stage 1's import flow lives. Verified live with Playwright (390×844): fresh
install shows it; full flow creates the starter (confirmed in Dexie) and persists
temp/reminders; tour lists all four tabs; "Start baking" sets both flags; reload
shows neither onboarding nor the prompt; the import path navigates to Settings.
tsc clean, build green, eslint unchanged (zero new). Test data cleaned up.

**Status:** Complete

---

## Cross-cutting notes
- **Schema migrations:** prefer plain optional fields (no version bump). Bump
  `db.version(2)` only if a stage adds a store/index or needs a `.upgrade()`
  backfill; if so, specify the exact schema-string diff and backfill. (Per
  review: don't churn the schema for `discardGrams`/`averagePeakTime`.)
- **Backup tracks schema + settings + photos:** `exportAllData` stamps
  `schemaVersion`; include localStorage `levain-settings` and embedded photo
  bytes (or explicit exclusion); `importAllData` migrates older exports forward,
  revives Dates, and rehydrates photos to `Directory.Data`.
- **Notification IDs:** Stage 0 is the single owner of ID allocation; later
  stages request IDs from it, never invent their own.
- **Deploy cadence:** ship each stage (and 1a/1b/1c, 3a/3b) independently;
  in-place update preserves data. Remove this file when all stages are Complete.

## MUST-FIX items folded in (from Codex review)
1. Backup/import includes `activeTimelines` + localStorage settings + a real
   photo (bytes) strategy. → Stage 1a/1b.
2. Import `replace` is validated + transactional; settings cleared only after DB
   success; timelines restored paused. → Stage 1c.
3. Multiple-active-timeline bug fixed/guarded before timeline features. → Stage 0.
4. Notification ID scheme redesigned before multi-timeline/reminder expansion. →
   Stage 0.
5. Dexie migration only when indexes/stores/backfills require it. → Cross-cutting.
