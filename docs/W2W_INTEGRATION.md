# W2W (Ways-to-Win) Slot Machine Integration Guide

## Overview

The W2W (Ways-to-Win) slot machine contract differs fundamentally from the 5reel contract:

- **Grid Generation**: Uses CDF (Cumulative Distribution Function) probabilistically, not fixed reels
- **Betting**: Fixed bet amounts (40/60) with modes (credit/network/token/bonus), not paylines
- **Payout**: Ways-to-win calculation (consecutive matching symbols left-to-right), not payline matching
- **Contract Calls**: Must call contract methods for grid and payout - cannot calculate locally

## Contract Methods

### Spin Methods

#### `spin(bet_amount: UInt64, index: UInt64, mode: UInt64) -> Bytes56`

Submit a spin transaction. Returns a 56-byte bet key.

**Parameters:**
- `bet_amount`: Bet amount in credits or microVOI (depending on mode)
  - Credit mode: Must be 40
  - Network/Token mode: 40 or 60
  - Bonus mode: 0 (uses bonus spins)
- `index`: Unique spin index per user (increments with each spin)
- `mode`: Betting mode
  - `0` = Bonus spin (uses bonus spins, bet_amount must be 0)
  - `1` = Credit spin (uses user credits, bet_amount must be 40)
  - `2` = Network spin (uses VOI, bet_amount 40 or 60)
  - `4` = Token spin (uses ARC200 tokens, bet_amount 40 or 60)

**Returns:**
- `Bytes56`: Bet key (56 bytes) used for claiming the outcome

**Example:**
```typescript
const betKey = await contract.spin({
  bet_amount: BigInt(40),
  index: BigInt(spinIndex),
  mode: BigInt(1) // Credit mode
});
```

### Claim Methods

#### `claim(bet_key: Bytes56) -> UInt64`

Claim the payout for a completed spin.

**Parameters:**
- `bet_key`: 56-byte bet key from the spin transaction

**Returns:**
- `UInt64`: Payout amount in credits or microVOI (depending on mode)

**Example:**
```typescript
const payout = await contract.claim({
  bet_key: betKeyBytes
});
```

### Read-Only Methods

#### `get_user(address: Address) -> UserData`

Get user data including credits and bonus spins.

**Returns:**
```typescript
{
  who: Address;
  credit: UInt64;        // Available credits
  bonus_spin: UInt64;   // Available bonus spins
  spin_count: UInt64;   // Total spins played
  last_spin_timestamp: UInt64;
}
```

#### `get_machine_state() -> MachineState`

Get machine configuration and state.

**Returns:**
```typescript
{
  jackpot_credit: UInt64;
  jackpot_credit_contribution: UInt64;
  jackpot_network: UInt64;
  jackpot_network_contribution: UInt64;
  jackpot_token: UInt256;
  jackpot_token_contribution: UInt256;
  mode_enabled: UInt64;           // Bit flags: 1=credit, 2=network, 4=token
  credit_bet_cost: UInt64;       // 40 credits
  network_base_bet_cost: UInt64;  // 40 microVOI
  network_kicker_extra: UInt64;    // 20 microVOI (for 60 bet)
  token_base_bet_cost: UInt256;
  token_kicker_extra: UInt256;
  // ... other fields
}
```

#### `get_cdf_grid(seed: Bytes32) -> Bytes15` (readonly)

Generate grid from a seed. Returns 15 bytes (5 reels × 3 rows).

**Note:** This method uses the contract's internal CDF logic. The seed should be derived from the block seed at the claim round.

#### `calculate_grid_payout_with_bonus_and_jackpot(...) -> SpinResult` (readonly)

Calculate the complete payout including bonus spins and jackpot.

**Returns:**
```typescript
{
  payout: UInt64;
  bonus_spins_awarded: UInt64;
  jackpot_hit: Bool;
  jackpot_amount: UInt64;
}
```

## Grid Generation

### CDF-Based Generation

The W2W contract uses Cumulative Distribution Functions (CDFs) to probabilistically generate symbols:

1. **Reel 1 CDF**: No wilds allowed
2. **Reels 2-5 CDF**: Includes wilds (B, C, D)

**Process:**
1. Contract receives block seed from claim round
2. For each position (reel × row):
   - Extract random value from seed + bet_key
   - Use CDF to determine symbol
   - Reel 1 uses `CDF_REEL1`, others use `CDF_OTHERS`

**Grid Format:**
- 5 reels × 3 rows = 15 symbols total
- Each symbol is a single byte (0x0-0xF)
- Contract returns as `Bytes15` (15 bytes)

### Symbol Mapping

```
0x0 = '0' (Buffalo)
0x1 = '1' (Eagle)
0x2 = '2' (Cougar)
0x3 = '3' (Elk)
0x4 = '4' (Wolf)
0x5 = '5' (A)
0x6 = '6' (K)
0x7 = '7' (Q)
0x8 = '8' (J)
0x9 = '9' (Ten)
0xA = 'A' (Nine)
0xB = 'B' (Wild 1x)
0xC = 'C' (Wild 2x)
0xD = 'D' (Wild 3x)
0xE = 'E' (HOV - Jackpot trigger)
0xF = 'F' (Bonus - Bonus spins trigger)
```

## Ways-to-Win Calculation

### Algorithm

1. **For each symbol** (excluding wilds, bonus, HOV):
   - Check if symbol appears on reel 0
   - If yes, count consecutive reels with matches (left-to-right)
   - Count ways per reel (symbols + wilds that match)
   - Calculate: `base_payout × ways × wild_multiplier`

2. **Ways Calculation:**
   - For each reel in the match sequence:
     - Count matching symbols (base symbol + wilds)
     - Multiply counts across reels: `ways = reel0_matches × reel1_matches × ...`

3. **Wild Multipliers:**
   - Wild 1x (B): No multiplier
   - Wild 2x (C): 2× multiplier
   - Wild 3x (D): 3× multiplier
   - Highest wild multiplier in the match sequence applies

4. **Payout Formula:**
   ```
   payout = pay_table[symbol][match_length] × ways × wild_multiplier
   ```

### Example

Grid:
```
Reel 0: [Buffalo, Buffalo, Wild2x]
Reel 1: [Buffalo, Eagle, Buffalo]
Reel 2: [Buffalo, Cougar, Buffalo]
Reel 3: [Eagle, Eagle, Eagle]
```

Buffalo ways-to-win:
- Reel 0: 3 matches (2 Buffalo + 1 Wild2x)
- Reel 1: 2 matches (2 Buffalo)
- Reel 2: 2 matches (2 Buffalo)
- Reel 3: 0 matches (no Buffalo or wilds) - stops here
- Match length: 3 reels
- Ways: 3 × 2 × 2 = 12 ways
- Wild multiplier: 2× (from Wild2x on reel 0)
- Base payout (Buffalo, 3 matches): 68 credits
- Total payout: 68 × 12 × 2 = 1,632 credits

## Bonus Spins & Jackpot

### Bonus Spins

- **Trigger**: 2+ BONUS symbols (F) in the grid
- **Awarded**: 8 bonus spins
- **Multiplier**: 1.5× applied to all payouts during bonus spins
- **Mode**: Uses mode 0 (bonus spin) with bet_amount = 0

**Automatic Processing:** Bonus spins are processed automatically by the GameBridge. When an OUTCOME includes `bonusSpinsAwarded > 0`, the bridge:

1. Waits for the triggering spin's claim to complete (awards bonus spins on-chain)
2. Sends `BONUS_SPIN_START` to the game
3. Processes each bonus spin sequentially (submit → outcome → claim)
4. Sends `BONUS_SPIN_PROGRESS` after each spin completes
5. Sends `BONUS_SPIN_RESULTS` with all outcomes when done

Games should **not** send their own bonus `SPIN_REQUEST` messages. If a game attempts to send a bonus spin request while the bridge is processing, it will receive a `BONUS_PROCESSING` error.

See the [PostMessage API Reference](../plans/game-integration/07-postmessage-api.md) for full message type documentation.

### Jackpot

- **Trigger**: 3+ HOV symbols (E) in the grid
- **Amount**: Current jackpot pool (starts at 50,000 credits)
- **Contribution**: Each spin contributes 3 credits to jackpot (except bonus spins)
- **Modes**: Separate jackpots for credit, network, and token modes

## Betting Modes

### Mode 0: Bonus Spin
- Uses bonus spins from user account
- `bet_amount` must be 0
- Requires `bonus_spin >= 1` in user data
- No jackpot contribution
- **Note:** Bonus spins are processed automatically by the bridge after a triggering spin awards them. Games should not submit mode 0 spins manually.

### Mode 1: Credit Spin
- Uses user credits
- `bet_amount` must be 40
- Requires `credit >= 40` in user data
- Contributes to credit jackpot

### Mode 2: Network Spin
- Uses VOI (native token)
- `bet_amount` must be 40 or 60
- Requires sufficient VOI balance (bet_amount + spin_cost)
- Contributes to network jackpot

### Mode 4: Token Spin
- Uses ARC200 tokens
- `bet_amount` must be 40 or 60 (in token units)
- Requires sufficient token balance
- Contributes to token jackpot

## Claim Round

- **Round Future Delta**: 2 rounds
- **Claim Round**: `submit_round + 2`
- The contract uses the block seed from the claim round to generate the grid
- Must wait until claim round is reached before calling `claim()`

## Integration Flow

### 1. Initialize

```typescript
// Get user data
const userData = await contract.get_user({ address: userAddress });
const credits = userData.credit;
const bonusSpins = userData.bonus_spin;

// Get machine state
const machineState = await contract.get_machine_state();
const jackpotAmount = machineState.jackpot_credit;
```

### 2. Submit Spin

```typescript
// Generate unique index (should increment per user)
const spinIndex = await getNextSpinIndex(userAddress);

// Submit spin
const betKey = await contract.spin({
  bet_amount: BigInt(40),
  index: BigInt(spinIndex),
  mode: BigInt(1) // Credit mode
});

// Store betKey and claimRound (currentRound + 2)
const claimRound = currentRound + 2;
```

### 3. Wait for Claim Round

```typescript
// Poll until claim round is reached
while (currentRound < claimRound) {
  await sleep(1000);
  currentRound = await getCurrentRound();
}
```

### 4. Calculate Outcome (Preview)

```typescript
// Get block seed for claim round
const blockSeed = await getBlockSeed(claimRound);

// Generate grid (local calculation for preview)
const grid = await contract.get_cdf_grid({ seed: blockSeed });

// Calculate payout (local calculation)
const spinResult = await contract.calculate_grid_payout_with_bonus_and_jackpot({
  grid: gridBytes,
  // ... other params
});
```

### 5. Claim Payout

```typescript
// Claim on-chain
const payout = await contract.claim({
  bet_key: betKeyBytes
});

// Update user data
const updatedUserData = await contract.get_user({ address: userAddress });
```

## Error Handling

### Common Errors

- **"bonus spin is less than 1"**: Trying to use bonus mode without bonus spins
- **"credit is less than bet amount"**: Insufficient credits for credit mode
- **"bet amount must be 40 or 60"**: Invalid bet amount for network/token mode
- **"credit mode not enabled"**: Mode 1 not enabled in machine state
- **"bet already exists"**: Duplicate spin with same parameters

## Testing

### Test Grid Generation

```typescript
// Test CDF grid generation matches contract
const testSeed = "0x1234...";
const contractGrid = await contract.get_cdf_grid({ seed: testSeed });
const localGrid = generateGridFromCDF(testSeed, betKey);
assert(contractGrid === localGrid);
```

### Test Ways-to-Win Calculation

```typescript
// Test payout calculation matches contract
const testGrid = parseGrid(gridBytes);
const contractPayout = await contract.calculate_grid_payout_with_bonus_and_jackpot({
  grid: gridBytes
});
const localPayout = calculateWaysToWin(testGrid);
assert(Math.abs(contractPayout - localPayout) < 1); // Allow small rounding differences
```

## Frontend Integration

### Component Structure

- **W2WSlotsGame.svelte**: Main game component
- **W2WBettingControls.svelte**: Bet amount (40/60) and mode selection
- **W2WWinDisplay.svelte**: Ways-to-win breakdown display
- **ReelGrid.svelte**: Grid display with W2W symbol support and ways-to-win highlighting

### Key Differences from 5reel

1. **No Paylines**: W2W doesn't use paylines - highlight matching symbols left-to-right
2. **Fixed Bet Amounts**: Only 40 or 60 (not configurable per line)
3. **Mode Selection**: User must choose credit/network/token/bonus mode
4. **Ways Display**: Show ways-to-win breakdown per symbol instead of paylines
5. **Bonus Spins**: Display bonus spin count and allow bonus spin button
6. **Jackpot Display**: Show current jackpot amount

## References

- Contract source: `hov-w2w/src/contract.py`
- PostMessage API: `POSTMESSAGE_API.md`
- Adapter implementation: `src/lib/game-engine/adapters/VoiW2WAdapter.ts`

