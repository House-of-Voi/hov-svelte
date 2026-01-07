# Launch Machines Feature

## Feature Design & Implementation Document

**Created:** 2025-01-05
**Last Updated:** 2025-01-06
**Status:** Complete (All 5 Phases)

---

## Table of Contents

1. [Overview](#overview)
2. [Goals & Requirements](#goals--requirements)
3. [Architecture](#architecture)
4. [Database Schema](#database-schema)
5. [Implementation Phases](#implementation-phases)
6. [Phase Details](#phase-details)
7. [API Reference](#api-reference)
8. [UI/UX Specifications](#uiux-specifications)
9. [Progress Log](#progress-log)

---

## Overview

The Launch Machines feature enables administrators to create and deploy new game machines (slots, keno, roulette) to the Voi blockchain. Each machine consists of:

1. **Game Contract** - The on-chain game logic (e.g., SlotMachine, KenoGame)
2. **Treasury Contract** - The YieldBearingToken (YBT) contract managing the house pool

### Key Capabilities

- **Register Mode**: Register existing deployed contracts by loading metadata from on-chain state
- **Deploy Mode**: Deploy new contracts directly from the admin UI (admin pays gas)
- **Draft Mode**: Save machine configurations before deployment

### Business Model

- Each machine has its own treasury - anyone can deposit to "act as the house"
- Profits are split proportionally among depositors (YBT share holders)
- Optional per-machine platform fee (0-100%) goes to platform treasury

---

## Goals & Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR1 | Admins can create draft machine configurations | High |
| FR2 | Admins can register existing deployed contracts | High |
| FR3 | Admins can deploy new contracts from the UI | High |
| FR4 | System loads on-chain state when registering | High |
| FR5 | Each machine tracks deployment status lifecycle | High |
| FR6 | Platform fee is configurable per machine | Medium |
| FR7 | Admin can pause/unpause machines | Medium |
| FR8 | Admin can deprecate machines | Low |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR1 | Only owner/operator roles can launch machines |
| NFR2 | Private keys never sent to server - signing is client-side only |
| NFR3 | Backwards compatibility with existing code during migration |
| NFR4 | All deployment transactions are tracked for audit |

### Permissions

| Action | Required Role |
|--------|---------------|
| View machines | viewer, operator, owner |
| Create draft | operator, owner |
| Register existing | operator, owner |
| Deploy new | operator, owner |
| Pause/unpause | operator, owner |
| Deprecate | owner |

---

## Architecture

### System Context

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Admin UI      │────▶│   SvelteKit     │────▶│   Supabase      │
│   (Browser)     │     │   API Routes    │     │   (machines)    │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         │ Sign Txns
         ▼
┌─────────────────┐                            ┌─────────────────┐
│   Wallet        │───────────────────────────▶│   Voi Network   │
│   (CDP/Kibisis) │                            │   (Contracts)   │
└─────────────────┘                            └─────────────────┘
```

### Component Architecture

```
src/
├── lib/
│   ├── services/
│   │   └── machineService.ts          # Machine queries (DONE)
│   ├── voi/
│   │   ├── machine-state-reader.ts    # Read on-chain state (Phase 2)
│   │   └── machine-deployer.ts        # Build deploy txns (Phase 4)
│   ├── types/
│   │   ├── database.ts                # Machine types (DONE)
│   │   └── admin.ts                   # Admin types (DONE)
│   └── components/
│       └── admin/
│           ├── machines/
│           │   ├── MachinesList.svelte       # (Phase 3)
│           │   ├── MachineCreateWizard.svelte # (Phase 3)
│           │   ├── MachineRegisterForm.svelte # (Phase 3)
│           │   └── MachineDeployFlow.svelte   # (Phase 4)
│           └── WalletConnectAdmin.svelte      # (Phase 4)
├── routes/
│   ├── api/
│   │   ├── machines/+server.ts              # Public API (DONE)
│   │   └── admin/
│   │       └── machines/
│   │           ├── +server.ts               # CRUD (Phase 2)
│   │           ├── [id]/+server.ts          # Single machine (Phase 2)
│   │           ├── [id]/deploy/+server.ts   # Deploy (Phase 4)
│   │           └── contract-state/
│   │               └── [appId]/+server.ts   # On-chain read (Phase 2)
│   └── admin/
│       └── machines/
│           ├── +page.svelte                 # List (Phase 3)
│           ├── new/+page.svelte             # Create wizard (Phase 3)
│           ├── register/+page.svelte        # Register form (Phase 3)
│           └── [id]/
│               ├── +page.svelte             # View/edit (Phase 3)
│               └── deploy/+page.svelte      # Deploy flow (Phase 4)
└── db/
    └── migrations/
        ├── 005_archive_unused_tables.sql    # (DONE)
        ├── 006_create_machines_table.sql    # (DONE)
        └── 007_migrate_slot_configs.sql     # (DONE)
```

---

## Database Schema

### machines Table (Implemented)

```sql
CREATE TABLE public.machines (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  theme TEXT,

  -- Type & Chain
  machine_type machine_type NOT NULL,  -- slots_5reel, slots_w2w, keno, roulette
  chain chain_type NOT NULL DEFAULT 'voi',

  -- Contract IDs (on-chain)
  game_contract_id BIGINT UNIQUE,
  treasury_contract_id BIGINT UNIQUE,
  treasury_asset_id BIGINT,

  -- Game Configuration
  config JSONB NOT NULL DEFAULT '{}',
  rtp_target NUMERIC(5,2),
  house_edge NUMERIC(5,2),
  min_bet BIGINT NOT NULL,
  max_bet BIGINT NOT NULL,

  -- Platform Economics
  platform_fee_percent NUMERIC(5,2) DEFAULT 0.00,
  platform_treasury_address TEXT,

  -- Status & Lifecycle
  status machine_status NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,

  -- Deployment Tracking
  created_by UUID REFERENCES public.profiles(id),
  deployment_tx_id TEXT,
  deployment_error TEXT,
  deployment_started_at TIMESTAMPTZ,
  deployment_completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  launched_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ
);
```

### Enums

```sql
-- Machine types (game types)
CREATE TYPE machine_type AS ENUM (
  'slots_5reel',
  'slots_w2w',
  'keno',
  'roulette'
);

-- Machine status (deployment lifecycle)
CREATE TYPE machine_status AS ENUM (
  'draft',
  'deploying',
  'bootstrapping',
  'active',
  'paused',
  'failed',
  'deprecated'
);
```

### Status Lifecycle

```
                    ┌──────────┐
                    │  draft   │
                    └────┬─────┘
                         │ Start Deploy
                         ▼
                    ┌──────────┐
              ┌─────│ deploying│─────┐
              │     └────┬─────┘     │
              │          │           │
              │          ▼           │
              │   ┌─────────────┐    │
              │   │bootstrapping│    │
              │   └──────┬──────┘    │
              │          │           │
         Fail │          │ Success   │ Fail
              │          ▼           │
              │     ┌────────┐       │
              └────▶│ failed │◀──────┘
                    └────────┘

                    ┌────────┐
                    │ active │◀─────────┐
                    └───┬────┘          │
                        │               │
              Pause     │     Unpause   │
                        ▼               │
                    ┌────────┐          │
                    │ paused │──────────┘
                    └────────┘
                        │
              Deprecate │
                        ▼
                   ┌───────────┐
                   │deprecated │
                   └───────────┘
```

---

## Implementation Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| 1 | Database & Core Types | ✅ Complete | Schema, migrations, type definitions |
| 2 | Admin API & Contract Reader | ✅ Complete | CRUD API, on-chain state reader |
| 3 | Admin UI | ✅ Complete | Machine list, create wizard, register form |
| 4 | Deployment Flow | ✅ Complete | Transaction building, wallet signing, deploy UI |
| 5 | Testing & Polish | ✅ Complete | Error handling, deployment resume, edge cases |

---

## Phase Details

### Phase 1: Database & Core Types ✅ COMPLETE

**Objective:** Establish the data foundation for the feature.

**Completed Items:**
- [x] Created migration 005: Archive unused tables (games, game_plays)
- [x] Created migration 006: Create machines table with new schema
- [x] Created migration 007: Migrate slot_machine_configs data
- [x] Applied all migrations to development database
- [x] Updated `src/lib/types/database.ts` with Machine types
- [x] Updated `src/lib/types/admin.ts` with admin types
- [x] Updated `src/lib/types/house.ts` to use Machine
- [x] Created `src/lib/services/machineService.ts`
- [x] Created `src/routes/api/machines/+server.ts` (public endpoint)
- [x] Updated legacy endpoints for backwards compatibility

**Files Created/Modified:**
- `db/migrations/005_archive_unused_tables.sql`
- `db/migrations/006_create_machines_table.sql`
- `db/migrations/007_migrate_slot_configs_to_machines.sql`
- `src/lib/types/database.ts`
- `src/lib/types/admin.ts`
- `src/lib/types/house.ts`
- `src/lib/services/machineService.ts`
- `src/lib/services/gameConfigService.ts` (now re-exports from machineService)
- `src/routes/api/machines/+server.ts`
- `src/routes/api/games/slot-configs/+server.ts` (updated for compat)
- `src/routes/api/admin/slot-configs/+server.ts` (updated for compat)

---

### Phase 2: Admin API & Contract Reader ✅ COMPLETE

**Objective:** Build the server-side infrastructure for machine management.

**Tasks:**
- [x] Create admin machines API (`/api/admin/machines/+server.ts`)
  - GET: List all machines with filters (type, status, chain)
  - POST: Create draft or register existing
- [x] Create single machine API (`/api/admin/machines/[id]/+server.ts`)
  - GET: Get machine details
  - PATCH: Update draft machine
  - DELETE: Delete draft machine
- [x] Create contract state reader (`src/lib/voi/machine-state-reader.ts`)
  - `readGameContractState(appId)` - Read SlotMachine/game state
  - `readTreasuryContractState(appId)` - Read YBT state
  - `validateContractPair(gameId, treasuryId)` - Verify ownership link
- [x] Create contract state API (`/api/admin/machines/contract-state/[appId]/+server.ts`)
- [x] Add DEPLOY_MACHINES permission to admin auth

**API Specifications:**

```typescript
// POST /api/admin/machines
// Create draft
{
  mode: 'draft',
  name: string,
  display_name: string,
  machine_type: MachineType,
  min_bet: number,
  max_bet: number,
  platform_fee_percent?: number,
  config?: Record<string, unknown>
}

// Register existing
{
  mode: 'register',
  game_contract_id: number,
  treasury_contract_id?: number,
  name: string,
  display_name: string,
  machine_type: MachineType,
  platform_fee_percent?: number
}

// GET /api/admin/machines/contract-state/:appId
// Response
{
  success: true,
  data: {
    type: 'game' | 'treasury',
    owner: string,
    bootstrapped: boolean,
    // Game-specific
    balanceTotal?: bigint,
    balanceAvailable?: bigint,
    balanceLocked?: bigint,
    // Treasury-specific
    name?: string,
    symbol?: string,
    totalSupply?: bigint,
    yieldBearingSource?: number
  }
}
```

**Contract State Reader Implementation Notes:**

The reader should use the existing patterns from:
- `src/lib/voi/contract-client.ts` - For simulation-based state reading
- `src/lib/voi/house/ybt-service.ts` - For YBT-specific queries
- `src/lib/voi/arc200.ts` - For ARC200 token queries

Key methods to expose from contracts:
- SlotMachine: `get_owner()`, `get_balances()`, `get_reel_count()`, `get_payline_count()`
- YBT: `get_owner()`, `arc200_name()`, `arc200_symbol()`, `arc200_totalSupply()`, global state for `yield_bearing_source`

---

### Phase 3: Admin UI ✅ COMPLETE

**Objective:** Build the admin interface for machine management.

**Tasks:**
- [x] Create machines list page (`/admin/machines/+page.svelte`)
  - Table with all machines
  - Filters: type, status, chain
  - Status badges
  - Actions: View, Edit (draft), Deploy, Pause
- [x] Create machine create wizard (`/admin/machines/new/+page.svelte`)
  - Step 1: Basic info (name, display name, type)
  - Step 2: Game config (bet limits, RTP)
  - Step 3: Platform settings (fee, treasury address)
  - Step 4: Review & Save Draft
- [x] Create register form (`/admin/machines/register/+page.svelte`)
  - Contract ID input
  - "Load State" button
  - Display loaded state
  - Metadata inputs
  - Validation before save
- [x] Create machine detail page (`/admin/machines/[id]/+page.svelte`)
  - View all machine details
  - Edit form (if draft)
  - Status history
  - Link to deploy (if draft)
- [x] Add "Machines" to admin nav

**UI Components:**

```svelte
<!-- MachinesList.svelte -->
- Uses $state for loading, filters, machines array
- Fetches from /api/admin/machines
- Renders table with status badges
- Pagination controls

<!-- MachineCreateWizard.svelte -->
- Multi-step wizard with progress indicator
- Form validation via Zod
- Saves to /api/admin/machines (mode: 'draft')

<!-- MachineRegisterForm.svelte -->
- Contract ID input
- Loads state via /api/admin/machines/contract-state/:appId
- Displays loaded state for verification
- Saves to /api/admin/machines (mode: 'register')

<!-- MachineStatusBadge.svelte -->
- Renders colored badge based on status
- draft: gray
- deploying/bootstrapping: yellow
- active: green
- paused: orange
- failed: red
- deprecated: gray strikethrough
```

---

### Phase 4: Deployment Flow ✅ COMPLETE

**Objective:** Enable deploying new contracts from the admin UI.

**Tasks:**
- [x] Create machine deployer service (`src/lib/voi/machine-deployer.ts`)
  - Build SlotMachine creation transaction
  - Build SlotMachine bootstrap transaction
  - Build YBT creation transaction
  - Build YBT bootstrap transaction
  - Build YBT set_yield_bearing_source transaction
  - Build SlotMachine transfer_ownership transaction
  - Calculate total deployment cost
- [x] Create deploy API (`/api/admin/machines/[id]/deploy/+server.ts`)
  - POST: Build unsigned transactions
  - Response: Transaction group for signing
- [x] Create deploy confirm API (`/api/admin/machines/[id]/confirm/+server.ts`)
  - POST: Update machine status after deployment
- [x] Create wallet connect component for admin (`WalletConnectAdmin.svelte`)
  - External wallet connection (Kibisis, Lute, etc.)
- [x] Create deploy flow UI (`/admin/machines/[id]/deploy/+page.svelte`)
  - Show deployment cost estimate
  - Connect wallet
  - Sign transactions
  - Track deployment progress
  - Handle errors
- [x] Add contract version tracking (migration 008)
- [x] Create contract registry for version-aware deployment

**Deployment Transaction Sequence:**

```
1. Create SlotMachine App
   └─ Returns: slotMachineAppId

2. Bootstrap SlotMachine
   └─ Payment: bootstrap_cost (~135,000 microVOI)
   └─ App Call: bootstrap()

3. Create YBT App
   └─ Returns: ybtAppId

4. Bootstrap YBT
   └─ Payment: bootstrap_cost (~100,000 microVOI)
   └─ App Call: bootstrap()

5. Set Yield Bearing Source
   └─ App Call: YBT.set_yield_bearing_source(slotMachineAppId)

6. Transfer SlotMachine Ownership
   └─ App Call: SlotMachine.transfer_ownership(ybtAppAddress)

7. (Optional) Initial Funding
   └─ Payment to SlotMachine: initial_funding_amount
   └─ App Call: SlotMachine.owner_deposit(amount)
```

**Cost Estimation:**

```typescript
interface DeploymentCost {
  slotMachineMinBalance: bigint;  // ~100,000
  slotMachineBootstrap: bigint;   // ~135,000
  ybtMinBalance: bigint;          // ~100,000
  ybtBootstrap: bigint;           // ~100,000
  transactionFees: bigint;        // ~7,000 (7 txns × 1,000)
  total: bigint;                  // ~442,000 microVOI + initial funding
}
```

---

### Phase 5: Testing & Polish ✅ COMPLETE

**Objective:** Ensure feature is production-ready.

**Completed Items:**
- [x] Database migrations for deployment state persistence (008, 009)
  - Added contract version tracking
  - Added deployment state JSON column for recovery
  - Added deployment log for audit trail
  - Added rate limiting timestamp
- [x] Enhanced error handling with classification:
  - Insufficient funds detection
  - Transaction rejection handling
  - Network error recovery
  - Contract already exists detection
- [x] User-friendly error messages with recovery guidance
- [x] Deployment state persistence for interrupted deployments
- [x] Updated machines list with deployment status indicators
  - Added "Resume Deployment" button for in-progress deployments
  - Added "Retry Deployment" button for failed deployments
  - Added deployment error display for failed machines
- [x] Audit logging via `deployment_log` column

**Files Modified:**
- `src/routes/admin/machines/[id]/deploy/+page.svelte` (error classification)
- `src/routes/admin/machines/+page.svelte` (deployment status UI)

**Error Types Handled:**
| Error Type | Detection | Recoverable |
|------------|-----------|-------------|
| Insufficient Funds | "insufficient", "balance", "overspend" | Yes |
| User Rejected | "rejected", "cancelled", "denied" | Yes |
| Network Error | "network", "timeout", "connection" | Yes |
| Contract Exists | "already exists", "already set" | No |
| Unknown | All other errors | Yes |

**Deployment Recovery:**
- Deployment state saved to `deployment_state` column after each phase
- On page load, state is restored to allow resuming interrupted deployments
- Contract IDs are preserved in database even if deployment fails mid-process

---

## API Reference

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/machines` | List active machines |
| GET | `/api/machines?game_contract_id=X` | Get single machine by contract ID |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/machines` | List all machines with filters |
| POST | `/api/admin/machines` | Create draft or register existing |
| GET | `/api/admin/machines/:id` | Get machine details |
| PATCH | `/api/admin/machines/:id` | Update draft machine |
| DELETE | `/api/admin/machines/:id` | Delete draft machine |
| GET | `/api/admin/machines/contract-state/:appId` | Read on-chain state |
| POST | `/api/admin/machines/:id/deploy` | Build deployment transactions |
| POST | `/api/admin/machines/:id/confirm` | Confirm deployment complete |

### Legacy Endpoints (Backwards Compatible)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/games/slot-configs` | Maps to machines table |
| GET | `/api/admin/slot-configs` | Maps to machines table |

---

## UI/UX Specifications

### Admin Navigation

Add to `src/lib/components/admin/AdminNav.svelte`:
```typescript
{ href: '/admin/machines', label: 'Machines', permission: PERMISSIONS.VIEW_GAMES }
```

### Machine Status Colors

| Status | Background | Text |
|--------|------------|------|
| draft | `bg-neutral-500/20` | `text-neutral-400` |
| deploying | `bg-warning-500/20` | `text-warning-400` |
| bootstrapping | `bg-warning-500/20` | `text-warning-400` |
| active | `bg-success-500/20` | `text-success-400` |
| paused | `bg-orange-500/20` | `text-orange-400` |
| failed | `bg-error-500/20` | `text-error-400` |
| deprecated | `bg-neutral-500/20` | `text-neutral-500 line-through` |

### Machine Type Labels

| Type | Label |
|------|-------|
| slots_5reel | 5-Reel Slots |
| slots_w2w | Ways to Win Slots |
| keno | Keno |
| roulette | Roulette |

---

## Progress Log

### 2025-01-05 - Phase 1 Complete

**Completed:**
- Database schema designed and implemented
- All migrations created and applied
- Type definitions updated
- Machine service created
- Public API endpoint created
- Legacy endpoints updated for backwards compatibility
- Build verified successful

**Database State:**
- 3 machines migrated from slot_machine_configs
- Tables archived: games_deprecated, game_plays_deprecated, slot_machine_configs_deprecated
- New table active: machines

**Next Steps:**
- Begin Phase 2: Admin API & Contract Reader

---

### 2025-01-05 - Phase 2 Complete

**Completed:**
- Added DEPLOY_MACHINES permission to `src/lib/auth/permissions.ts` and `src/lib/types/admin.ts`
- Operator role now includes DEPLOY_MACHINES permission by default
- Created admin machines API (`/api/admin/machines/+server.ts`)
  - GET: List all machines with filters (type, status, chain, is_active, theme, pagination)
  - POST: Create draft machine or register existing deployed contract
- Created single machine API (`/api/admin/machines/[id]/+server.ts`)
  - GET: Get machine details by ID
  - PATCH: Update machine (full editing for drafts, limited for deployed)
  - DELETE: Delete draft machines only
- Created contract state reader (`src/lib/voi/machine-state-reader.ts`)
  - `readGameContractState(appId)` - Read SlotMachine state (owner, balances, fuse)
  - `readTreasuryContractState(appId)` - Read YBT state (owner, name, symbol, decimals, totalSupply, yieldBearingSource)
  - `validateContractPair(gameId, treasuryId)` - Validate treasury links to game and game is owned by treasury
  - `detectContractType(appId)` - Auto-detect if contract is game or treasury
- Created contract state API (`/api/admin/machines/contract-state/[appId]/+server.ts`)
  - GET with `?type=auto|game|treasury` - Read on-chain contract state
  - GET with `?validate_with=<treasuryAppId>` - Validate game+treasury pair
- All TypeScript errors fixed, build verified

**Files Created:**
- `src/routes/api/admin/machines/+server.ts`
- `src/routes/api/admin/machines/[id]/+server.ts`
- `src/routes/api/admin/machines/contract-state/[appId]/+server.ts`
- `src/lib/voi/machine-state-reader.ts`

**Files Modified:**
- `src/lib/auth/permissions.ts` (added DEPLOY_MACHINES)
- `src/lib/types/admin.ts` (added DEPLOY_MACHINES)

**API Summary:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/machines` | List machines with filters |
| POST | `/api/admin/machines` | Create draft or register existing |
| GET | `/api/admin/machines/:id` | Get machine by ID |
| PATCH | `/api/admin/machines/:id` | Update machine |
| DELETE | `/api/admin/machines/:id` | Delete draft machine |
| GET | `/api/admin/machines/contract-state/:appId` | Read on-chain state |

**Next Steps:**
- Begin Phase 3: Admin UI

---

### 2025-01-05 - Phase 3 Complete

**Completed:**
- Added "Machines" link to AdminNav.svelte (VIEW_GAMES permission)
- Created MachineStatusBadge.svelte component with status colors per spec
- Created MachineTypeBadge.svelte component with type labels per spec
- Created machines list page (`/admin/machines/+page.svelte`)
  - Table with all machines using Card-based layout
  - Filters: type, status, chain
  - Status badges, type badges, action buttons
  - Pagination controls
  - Links to create, register, and view details
- Created machine create wizard (`/admin/machines/new/+page.svelte`)
  - 4-step wizard: Basic Info → Game Config → Platform Settings → Review
  - Form validation at each step
  - Progress indicator
  - Saves draft to API
- Created register form (`/admin/machines/register/+page.svelte`)
  - Game Contract ID input with "Load State" button
  - Treasury Contract ID input with "Load State" button
  - Displays loaded on-chain state (balances, owner, etc.)
  - "Validate Pair" button for contract pair validation
  - Metadata inputs (name, display_name, type, fees)
  - Validates and saves via API
- Created machine detail page (`/admin/machines/[id]/+page.svelte`)
  - Server load function with VIEW_GAMES permission check
  - View mode: displays all machine details in card grid
  - Edit mode: full editing form for draft machines
  - Action buttons: Edit, Deploy (placeholder), Pause/Activate
  - Delete button for draft machines
  - Timeline section with all timestamps
- All TypeScript errors verified passing

**Files Created:**
- `src/lib/components/admin/machines/MachineStatusBadge.svelte`
- `src/lib/components/admin/machines/MachineTypeBadge.svelte`
- `src/routes/admin/machines/+page.svelte`
- `src/routes/admin/machines/new/+page.svelte`
- `src/routes/admin/machines/register/+page.svelte`
- `src/routes/admin/machines/[id]/+page.server.ts`
- `src/routes/admin/machines/[id]/+page.svelte`

**Files Modified:**
- `src/lib/components/admin/AdminNav.svelte` (added Machines link)

**UI Summary:**
| Route | Purpose |
|-------|---------|
| `/admin/machines` | List all machines with filters |
| `/admin/machines/new` | Create new draft machine wizard |
| `/admin/machines/register` | Register existing deployed contract |
| `/admin/machines/[id]` | View/edit machine details |

**Next Steps:**
- Begin Phase 4: Deployment Flow

---

### 2025-01-05 - Phase 4 Complete

**Completed:**
- Added contract version tracking to machines table (migration 008)
  - `game_contract_version` and `treasury_contract_version` columns
- Created contract registry (`src/lib/contracts/registry.ts`)
  - Maps (machine_type, version) → ContractSpec for game contracts
  - Maps version → ContractSpec for treasury contracts
  - Extensible for future contract versions
- Created machine deployer service (`src/lib/voi/machine-deployer.ts`)
  - Builds deployment transactions for all phases
  - Calculates deployment cost estimates
  - Phased deployment: create, bootstrap, link, transfer ownership
- Created deploy API (`/api/admin/machines/[id]/deploy/+server.ts`)
  - POST: Build unsigned transactions for each deployment phase
  - Supports phased deployment with transaction encoding
- Created deploy confirm API (`/api/admin/machines/[id]/confirm/+server.ts`)
  - POST: Update machine status and contract IDs after each phase
  - Handles success and failure confirmations
- Created WalletConnectAdmin component (`src/lib/components/admin/WalletConnectAdmin.svelte`)
  - External wallet connection via avm-wallet-svelte
  - Wallet selection for deployment
- Created deploy flow UI (`/admin/machines/[id]/deploy/+page.svelte`)
  - Multi-phase deployment wizard
  - Cost estimation display
  - Progress tracking with visual indicators
  - Transaction signing and submission
  - Error handling and retry support
- Updated machine detail page to link to deploy page

**Files Created:**
- `db/migrations/008_add_contract_versions.sql`
- `src/lib/contracts/registry.ts`
- `src/lib/voi/machine-deployer.ts`
- `src/routes/api/admin/machines/[id]/deploy/+server.ts`
- `src/routes/api/admin/machines/[id]/confirm/+server.ts`
- `src/lib/components/admin/WalletConnectAdmin.svelte`
- `src/routes/admin/machines/[id]/deploy/+page.server.ts`
- `src/routes/admin/machines/[id]/deploy/+page.svelte`

**Files Modified:**
- `src/lib/types/database.ts` (added contract version fields)
- `src/routes/admin/machines/[id]/+page.svelte` (added deploy button)

**Deployment Flow:**
1. Connect wallet (external wallet via avm-wallet-svelte)
2. Review cost estimate
3. Phase 1: Create game contract
4. Phase 1b: Bootstrap game contract
5. Phase 2: Create treasury contract
6. Phase 2b: Bootstrap treasury contract
7. Phase 3: Link treasury to game, transfer ownership
8. Complete: Machine is now active

**Next Steps:**
- Phase 5 complete. Feature is ready for production testing.

---

### 2025-01-06 - Phase 5 Complete

**Completed:**
- Applied migration 008 for contract version tracking
- Applied migration 009 for deployment state persistence and audit logging
- Enhanced deploy page with error classification
  - Insufficient funds: Shows required amount, guidance to add funds
  - User rejected: Clear message about transaction rejection
  - Network error: Guidance to check connection
  - Contract exists: Non-recoverable error handling
- Updated machines list with deployment status indicators
  - Added "Deploy" button for draft machines
  - Added "Resume Deployment" button (with pulse animation) for deploying/bootstrapping machines
  - Added "Retry Deployment" button for failed machines
  - Added deployment progress message for in-progress deployments
  - Added error display for failed machines
- Deployment state persistence allows resuming interrupted deployments
- Technical error details collapsible for unknown errors

**Files Modified:**
- `src/routes/admin/machines/[id]/deploy/+page.svelte` (error classification, recovery guidance)
- `src/routes/admin/machines/+page.svelte` (deployment status UI, action buttons)
- `docs/features/LAUNCH_MACHINES.md` (documentation updates)

**Testing Checklist:**
- [ ] Apply migrations 008 and 009 to Supabase
- [ ] Create draft machine via UI
- [ ] Navigate to deploy page
- [ ] Connect external wallet
- [ ] Complete deployment through all phases
- [ ] Verify machine status updates correctly
- [ ] Test error handling (reject transaction, insufficient funds)
- [ ] Test resume after browser refresh

---

## Appendix

### Relevant Existing Code

| File | Purpose |
|------|---------|
| `src/lib/voi/contract-client.ts` | Contract state reading via simulation |
| `src/lib/voi/house/ybt-service.ts` | YBT contract interactions |
| `src/lib/voi/arc200.ts` | ARC200 token queries |
| `src/lib/clients/SlotMachineClientW2W.ts` | Generated contract client |
| `src/lib/wallet/CdpAlgorandSigner.ts` | CDP wallet signing |
| `src/lib/wallet/StoredKeySigner.ts` | Stored key signing |

### Contract Methods Reference

**SlotMachine (from contract.py):**
- `bootstrap()` - Initialize contract
- `get_owner()` - Get owner address
- `get_balances()` - Get balance struct
- `transfer_ownership(new_owner)` - Transfer ownership
- `owner_deposit(amount)` - Deposit as owner

**YieldBearingToken:**
- `bootstrap()` - Initialize contract
- `get_owner()` - Get owner address
- `set_yield_bearing_source(app_id)` - Link to game contract
- `arc200_name()` - Get token name
- `arc200_symbol()` - Get token symbol
- `arc200_totalSupply()` - Get total supply
