# Launch Machines - Phase Prompts

This file contains prompts for continuing implementation of the Launch Machines feature across multiple context windows.

---

## Current Status

**Last Completed Phase:** Phase 3 (Admin UI)
**Next Phase:** Phase 4 (Deployment Flow)

---

## Phase 2 Prompt

Copy and paste this prompt into a new Claude Code session:

```
I'm continuing implementation of the "Launch Machines" feature for House of Voi.

**Context:** Read the feature design document at `docs/features/LAUNCH_MACHINES.md` for full context. Phase 1 (Database & Core Types) is complete.

**Current Task:** Implement Phase 2 - Admin API & Contract Reader

**Phase 2 Requirements:**
1. Create admin machines API (`/api/admin/machines/+server.ts`)
   - GET: List all machines with filters (type, status, chain, pagination)
   - POST: Create draft or register existing contracts

2. Create single machine API (`/api/admin/machines/[id]/+server.ts`)
   - GET: Get machine details
   - PATCH: Update draft machine
   - DELETE: Delete draft machine (only if status=draft)

3. Create contract state reader (`src/lib/voi/machine-state-reader.ts`)
   - `readGameContractState(appId)` - Read SlotMachine state (owner, balances, etc.)
   - `readTreasuryContractState(appId)` - Read YBT state (owner, name, symbol, totalSupply)
   - `validateContractPair(gameId, treasuryId)` - Verify YBT's yield source points to game

4. Create contract state API (`/api/admin/machines/contract-state/[appId]/+server.ts`)

5. Add DEPLOY_MACHINES permission to `src/lib/auth/admin.ts`

**Reference Files:**
- `src/lib/voi/contract-client.ts` - Pattern for contract state reading
- `src/lib/voi/house/ybt-service.ts` - Pattern for YBT queries
- `src/routes/api/admin/players/+server.ts` - Pattern for admin API endpoints
- `src/lib/types/admin.ts` - Types already defined (MachineFilters, MachineCreateDraftRequest, MachineRegisterRequest)
- `src/lib/services/machineService.ts` - Existing machine service

**After completing Phase 2:**
1. Update `docs/features/LAUNCH_MACHINES.md` Progress Log with completed work
2. Update the "Current Status" section in `docs/features/LAUNCH_MACHINES_PROMPTS.md`
3. Provide the prompt for Phase 3

Please start by reading the feature document, then plan and implement Phase 2.
```

---

## Phase 3 Prompt (Use after Phase 2 is complete)

```
I'm continuing implementation of the "Launch Machines" feature for House of Voi.

**Context:** Read the feature design document at `docs/features/LAUNCH_MACHINES.md` for full context. Phases 1-2 are complete.

**Current Task:** Implement Phase 3 - Admin UI

**Phase 3 Requirements:**
1. Create machines list page (`/admin/machines/+page.svelte`)
   - Server load function checking VIEW_GAMES permission
   - Client component with table, filters, pagination
   - Status badges, action buttons

2. Create machine create wizard (`/admin/machines/new/+page.svelte`)
   - Multi-step wizard (Basic Info → Config → Platform Settings → Review)
   - Form validation
   - Saves draft to API

3. Create register form (`/admin/machines/register/+page.svelte`)
   - Contract ID input with "Load State" button
   - Displays loaded on-chain state
   - Metadata inputs for name, display_name, etc.
   - Validates and saves via API

4. Create machine detail page (`/admin/machines/[id]/+page.svelte`)
   - View all machine details
   - Edit form if status=draft
   - Deploy button if status=draft

5. Add "Machines" link to AdminNav.svelte

**Reference Files:**
- `src/lib/components/admin/GamesClient.svelte` - Pattern for admin list component
- `src/routes/admin/players/+page.svelte` - Pattern for admin page structure
- `src/lib/stores/notificationStore.svelte` - For user feedback
- UI specs in `docs/features/LAUNCH_MACHINES.md` (status colors, type labels)

**After completing Phase 3:**
1. Update `docs/features/LAUNCH_MACHINES.md` Progress Log
2. Update "Current Status" in `docs/features/LAUNCH_MACHINES_PROMPTS.md`
3. Provide the prompt for Phase 4
```

---

## Phase 4 Prompt (Use after Phase 3 is complete)

```
I'm continuing implementation of the "Launch Machines" feature for House of Voi.

**Context:** Read the feature design document at `docs/features/LAUNCH_MACHINES.md` for full context. Phases 1-3 are complete.

**Current Task:** Implement Phase 4 - Deployment Flow

**Phase 4 Requirements:**
1. Create machine deployer service (`src/lib/voi/machine-deployer.ts`)
   - Build all deployment transactions (create, bootstrap, link, transfer)
   - Calculate deployment cost estimate
   - Return unsigned transaction group

2. Create deploy API (`/api/admin/machines/[id]/deploy/+server.ts`)
   - POST: Validate machine is draft, build transactions, return for signing

3. Create deploy confirm API (`/api/admin/machines/[id]/confirm/+server.ts`)
   - POST: Update machine with contract IDs and status=active

4. Create wallet connect component (`WalletConnectAdmin.svelte`)
   - Support CDP wallet (export key for signing)
   - Support external wallets (Kibisis)

5. Create deploy flow UI (`/admin/machines/[id]/deploy/+page.svelte`)
   - Show cost estimate
   - Wallet connection
   - Sign & submit transactions
   - Progress tracking
   - Error handling

**Reference Files:**
- `src/lib/wallet/CdpAlgorandSigner.ts` - CDP signing pattern
- `src/lib/wallet/StoredKeySigner.ts` - Key-based signing
- `src/lib/voi/house/ybt-service.ts` - Transaction building pattern
- Contract method specs in `docs/features/LAUNCH_MACHINES.md`

**After completing Phase 4:**
1. Update `docs/features/LAUNCH_MACHINES.md` Progress Log
2. Update "Current Status" in `docs/features/LAUNCH_MACHINES_PROMPTS.md`
3. Provide the prompt for Phase 5
```

---

## Phase 5 Prompt (Use after Phase 4 is complete)

```
I'm continuing implementation of the "Launch Machines" feature for House of Voi.

**Context:** Read the feature design document at `docs/features/LAUNCH_MACHINES.md` for full context. Phases 1-4 are complete.

**Current Task:** Implement Phase 5 - Testing & Polish

**Phase 5 Requirements:**
1. Handle edge cases:
   - Deployment interrupted (status stuck in deploying)
   - Contract already registered (unique constraint)
   - Invalid contract pair (YBT not owned by game)
   - Insufficient funds for deployment

2. Add retry mechanism for failed deployments

3. Add audit logging for machine operations:
   - Created, Registered, Deployed, Paused, Unpaused, Deprecated

4. Performance optimization:
   - Cache contract state reads
   - Efficient pagination

5. Update any remaining documentation

6. Verify all flows work E2E:
   - Create draft → Edit → Deploy → Active
   - Register existing → Active
   - Active → Pause → Unpause
   - Active → Deprecate

**After completing Phase 5:**
1. Update `docs/features/LAUNCH_MACHINES.md` with final status
2. Mark feature as complete
3. Create summary of all changes made
```

---

## Template for Updating After Each Phase

After completing a phase, update the Progress Log in `LAUNCH_MACHINES.md`:

```markdown
### YYYY-MM-DD - Phase X Complete

**Completed:**
- [List of completed items]

**Files Created:**
- [List of new files]

**Files Modified:**
- [List of modified files]

**Notes:**
- [Any important notes or decisions]

**Next Steps:**
- Begin Phase X+1
```

Then update the "Current Status" section at the top of this file.
