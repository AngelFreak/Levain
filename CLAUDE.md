# levain

## Overview
[Brief description of the project]

## Tech Stack
- Frontend: React 18 + TypeScript + Vite
- UI: shadcn/ui + Tailwind CSS
- Backend: Supabase (Auth, Database, Realtime, Storage)
- Mobile: Capacitor 6 (iOS + Android)

## Project Structure
```
src/
├── components/     # React components
│   └── ui/         # shadcn components
├── pages/          # Route pages
├── lib/            # Supabase client, utilities
├── hooks/          # Custom React hooks
└── types/          # TypeScript types
```

## Available Agents

### Shared (from ~/.claude/agents/)
- react-shadcn-expert: UI components with shadcn
- supabase-expert: Database, auth, realtime
- capacitor-expert: Mobile/native features
- code-reviewer: Quality checks

### Project-Specific (from .claude/agents/)
- levain-context: Domain knowledge

## Key Commands
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npx cap sync         # Sync Capacitor
npx cap run ios      # Run on iOS
npx cap run android  # Run on Android

# Android deployment (with SDK path)
ANDROID_HOME=~/Android/Sdk ANDROID_SDK_ROOT=~/Android/Sdk npx cap run android

# Fresh install (uninstall first to clear cached splash/logo)
ANDROID_HOME=~/Android/Sdk adb uninstall com.levain.app
```

## Browser Testing with Playwright MCP

When testing UI changes, always use Playwright MCP with mobile viewport size:

```
# Set mobile viewport (iPhone 14 Pro dimensions)
mcp__playwright__browser_resize({ width: 390, height: 844 })

# Navigate and take screenshots
mcp__playwright__browser_navigate({ url: "http://localhost:5174/" })
mcp__playwright__browser_snapshot()
mcp__playwright__browser_take_screenshot({ type: "png", filename: "test-name.png" })
```

**Always test with mobile dimensions (390x844) since this is a mobile-first app.**

## Test Flows

### Recipes - Auto-loaded on Startup
1. Navigate to **Book** (bottom nav)
2. Tap **Recipes** tab
3. Verify 16 default recipes are automatically loaded (no manual action needed)
4. Recipes are added on app startup via App.tsx useEffect

### Recipes - List View
1. Navigate to **Book → Recipes** (with recipes added)
2. Verify list layout shows:
   - Recipe icon (chef hat placeholder)
   - Full recipe name (not truncated)
   - Hydration % and hands-on time
   - **View** button (eye icon)
   - **Bake** button (play icon)
3. Verify favorite star shows on favorited recipes

### Recipes - Category Filters
1. Navigate to **Book → Recipes**
2. Scroll category pills horizontally
3. Verify all categories visible: All, Country, Buns & Rolls, Sandwich, Focaccia, Pizza, Rye Bread, Whole Grain, Enriched, Specialty, Discard
4. Tap **Pizza** → Verify only "Sourdough Pizza Dough" shows
5. Tap **Rye Bread** → Verify only "Soft-Core Rye Bread" shows
6. Tap **Focaccia** → Verify "Thyme Focaccia" shows
7. Tap **Buns & Rolls** → Verify 5 roll recipes show
8. Tap **All** → Verify all 9 recipes show

### Recipes - Search
1. Navigate to **Book → Recipes**
2. Type "pizza" in search box
3. Verify only "Sourdough Pizza Dough" shows
4. Clear search
5. Type "cold"
6. Verify "Cold-Proofed Porridge Rolls" and "Classic Cold-Proofed Sourdough Rolls" show

### Recipes - View Recipe Detail
1. Navigate to **Book → Recipes**
2. Tap **View** button on any recipe (e.g., "Thyme Focaccia")
3. Verify detail page shows:
   - Back button and favorite star in header
   - Recipe hero image/placeholder
   - Recipe name and description
   - Stats row: Hydration %, Starter %, Total Flour, Hands-on time (with icons)
   - Timing card (total time, best for)
   - Flour breakdown list
   - Additions list (if any)
   - Method steps with numbered badges, descriptions, tips, active/wait times
   - Notes section
   - Source attribution with external link
4. Tap **Back** → Returns to recipe list

### Recipes - Favorite Toggle
1. Navigate to recipe detail (tap View on any recipe)
2. Tap star icon in header
3. Verify toast: "Added to favorites"
4. Tap star again
5. Verify toast: "Removed from favorites"

### Recipes - Start Bake from Recipe
1. Navigate to **Book → Recipes**
2. Tap **Bake** button on any recipe
3. Verify Start Bake modal opens with recipe pre-selected

## Current Focus
[What's currently being worked on]
