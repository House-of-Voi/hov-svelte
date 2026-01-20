# PostMessage API Reference

Complete guide to integrating third-party games using the postMessage communication protocol.

## 🚨 BREAKING CHANGE: Namespace Required (v2.1+)

**All messages must now include a `namespace` field set to `"com.houseofvoi"`.**

Messages without this namespace will be silently filtered out. This change prevents conflicts with browser extensions and other scripts that may also use postMessage.

**Migration Required:** Add `namespace: "com.houseofvoi"` to all messages you send. Messages received from the bridge will also include this field.

See [Message Namespace](#message-namespace) section for details.

## Overview

Third-party games communicate with the House of Voi slot machine backend via **postMessage**. Games have **NO wallet access** - they only send spin requests and receive outcomes.

## Game Types

House of Voi supports two types of slot machine games:

- **`[5reel]` Payline-Based Slots** - Traditional slot machines with configurable paylines (1-20). Bets are specified as `paylines × betPerLine`. This is the original format and continues to work exactly as before.

- **`[W2W]` Ways-to-Win Slots** - Modern slots with ways-to-win calculation. Bets are specified as a fixed `betAmount` (40 or 60 credits). Includes special features like bonus spins, jackpots, and wild multipliers.

**Backward Compatibility:** Existing 5reel games continue to work with no changes required. The API automatically detects which game type you're integrating with based on the slot machine configuration.

**Message Format Indicators:** Throughout this documentation, you'll see these indicators:
- `[5reel]` - Only applies to payline-based slots
- `[W2W]` - Only applies to ways-to-win slots
- `[Both]` - Applies to both game types

## Architecture

```
┌─────────────────────────────────────┐
│   YOUR GAME UI                      │
│   (Unity, Phaser, WebGL, etc.)     │
│                                      │
│   - Reel animations                 │
│   - Win celebrations                │
│   - Sound effects                   │
│   - Bet controls                    │
│   - NO wallet access                │
└──────────────┬───────────────────────┘
               │ postMessage
               │ { type: 'SPIN_REQUEST', ... }
               │
┌──────────────▼───────────────────────┐
│   GAME BRIDGE                        │
│   (Handles blockchain operations)     │
└──────────────┬───────────────────────┘
               │ Blockchain API
┌──────────────▼───────────────────────┐
│   VOI BLOCKCHAIN                     │
└───────────────────────────────────────┘
```

## Breaking Changes & Migration

### What Changed in v2.1 (Latest)

**All messages must now include `namespace: "com.houseofvoi"`**

This is a breaking change that requires updating all message send/receive code. See [Message Namespace](#message-namespace) section for implementation details.

### What Changed in v2.0

The postMessage API now supports two game types (5reel and W2W) using discriminated union types. While **existing 5reel games continue to work**, some message payload structures have changed:

**1. SPIN_REQUEST Payload**
- **Before:** Always `{ paylines, betPerLine, spinId? }`
- **After:** Either `{ paylines, betPerLine, spinId? }` (5reel) OR `{ betAmount, reserved, spinId? }` (W2W)

**2. OUTCOME Payload**
- **Before:** Always included `winningLines`, `betPerLine`, `paylines`
- **After:** 5reel includes those fields, W2W includes `waysWins`, `betAmount`, `bonusSpinsAwarded`, `jackpotHit`, `jackpotAmount`

**3. CONFIG Payload**
- **Before:** Always included `maxPaylines`
- **After:** 5reel includes `maxPaylines`, W2W includes `jackpotAmount`, `bonusSpinMultiplier`

**4. New Message Types**
- Added `GET_CREDIT_BALANCE` request (W2W only)
- Added `CREDIT_BALANCE` response (W2W only)

**5. Win Level**
- Added `'none'` as a possible win level (in addition to existing levels)

### Migration Checklist

**For all integrations (v2.1+):**

- [ ] **REQUIRED:** Add `namespace: "com.houseofvoi"` to all outgoing messages
- [ ] **REQUIRED:** Add namespace filtering to message listener (filter out messages without matching namespace)
- [ ] Test that your game works with namespace filtering enabled

**If you're updating an existing 5reel game integration (v2.0):**

- [ ] *(Optional)* Update message listeners to handle `winLevel: 'none'`
- [ ] *(Optional)* Add type guards if using TypeScript to narrow union types

**If you're building a new W2W game integration:**

- [ ] Use W2W message formats (see message type documentation below)
- [ ] Handle `GET_CREDIT_BALANCE` / `CREDIT_BALANCE` messages for credit tracking
- [ ] Handle `bonusSpinsAwarded` in OUTCOME messages
- [ ] Handle `jackpotHit` and `jackpotAmount` in OUTCOME messages
- [ ] Display `waysWins` instead of `winningLines`

### Detecting Game Type

You can determine which game type you're integrating with by checking the CONFIG message:

```javascript
window.addEventListener('message', (event) => {
  const message = event.data;

  if (message.type === 'CONFIG') {
    // Check which game-type-specific fields exist
    if ('maxPaylines' in message.payload) {
      console.log('This is a 5reel game');
      // Use paylines/betPerLine format
    } else if ('jackpotAmount' in message.payload) {
      console.log('This is a W2W game');
      // Use betAmount/reserved format
    }
  }
});
```

## Integration Steps

### 1. Load Your Game in an Iframe

Your game will be loaded in an iframe on the House of Voi game page:

```
https://houseofvoi.com/games/slots?mode=external&url=<your-game-url>
```

### 2. Listen for Messages from Bridge

Set up a message listener in your game:

```javascript
window.addEventListener('message', (event) => {
  // Validate origin (optional but recommended)
  // if (event.origin !== 'https://houseofvoi.com') return;

  const message = event.data;

  // Filter by namespace (required)
  if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
    return;
  }

  switch (message.type) {
    case 'OUTCOME':
      handleOutcome(message.payload);
      break;
    case 'BALANCE_UPDATE':        // [5reel] Wallet balance updates
      updateBalance(message.payload);
      break;
    case 'BALANCE_RESPONSE':      // [5reel] Response to GET_BALANCE
      updateBalance(message.payload);
      break;
    case 'CREDIT_BALANCE':        // [W2W] Response to GET_CREDIT_BALANCE
      updateCredits(message.payload);
      break;
    case 'CONFIG':
      updateConfig(message.payload);
      break;
    case 'ERROR':
      handleError(message.payload);
      break;
    case 'SPIN_SUBMITTED':
      handleSpinSubmitted(message.payload);
      break;
    case 'SPIN_QUEUE':              // [Both] Spin queue state updates
      handleSpinQueue(message.payload);
      break;
    case 'ORIENTATION':             // [Both] Device orientation updates
      handleOrientation(message.payload);
      break;
  }
});
```

### 3. Send Messages to Bridge

Send requests to the parent window:

```javascript
// Send spin request
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'SPIN_REQUEST',
  payload: {
    paylines: 20,
    betPerLine: 1_000_000, // 1 VOI in microVOI
    spinId: 'my-spin-123' // Optional
  }
}, '*'); // Use specific origin in production

// Get balance
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'GET_BALANCE'
}, '*');

// Get config
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'GET_CONFIG'
}, '*');

// Initialize connection
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'INIT'
}, '*');

// Get spin queue state
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'GET_SPIN_QUEUE'
}, '*');

// Exit game and return to lobby
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'EXIT'
}, '*');
```

## Message Namespace

**All messages must include a `namespace` field set to `"com.houseofvoi"`.**

This namespace is required to filter out unintended postMessage communications from browser extensions, analytics scripts, and other third-party code that may also use postMessage on the same page.

### Why is a Namespace Required?

Many browser extensions (password managers, shopping assistants, etc.) and analytics libraries use `postMessage` for their own communication. Without namespace filtering, your game may receive irrelevant messages or the bridge may receive messages not intended for it, causing errors and unexpected behavior.

### How to Use the Namespace

**TypeScript/JavaScript Constant:**
```typescript
const MESSAGE_NAMESPACE = 'com.houseofvoi';
```

**When Sending Messages:**
Add the `namespace` field to every message you send:

```javascript
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'SPIN_REQUEST',
  payload: { /* ... */ }
}, '*');
```

**When Receiving Messages:**
Filter incoming messages by namespace before processing:

```javascript
window.addEventListener('message', (event) => {
  const message = event.data;

  // Ignore messages without our namespace
  if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
    return;
  }

  // Process message
  switch (message.type) {
    // ...
  }
});
```

**Error Handling:**
Messages without the correct namespace will be silently ignored (not logged as errors). This prevents console spam from unrelated postMessage traffic.

## Message Types

### Request Messages (Game → Bridge)

#### SPIN_REQUEST `[Both]`

Request a spin with specified bet. The payload format differs based on game type:

**`[5reel]` Payline-Based Format:**
```typescript
{
  namespace: 'com.houseofvoi';
  type: 'SPIN_REQUEST';
  payload: {
    paylines: number;      // 1-20
    betPerLine: number;    // microVOI (1 VOI = 1,000,000)
    spinId?: string;       // Optional client-generated ID
  };
}
```

**Example:**
```javascript
// 5reel: 20 paylines × 1 VOI per line = 20 VOI total bet
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'SPIN_REQUEST',
  payload: {
    paylines: 20,
    betPerLine: 1_000_000, // 1 VOI per line
    spinId: 'spin-' + Date.now()
  }
}, '*');
```

**`[W2W]` Ways-to-Win Format:**
```typescript
{
  namespace: 'com.houseofvoi';
  type: 'SPIN_REQUEST';
  payload: {
    betAmount: number;     // 40 or 60 credits
    reserved: number;      // 0 = regular spin, 1 = bonus spin
    spinId?: string;       // Optional client-generated ID
  };
}
```

**Example:**
```javascript
// W2W: Regular spin with 40 credits
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'SPIN_REQUEST',
  payload: {
    betAmount: 40,
    reserved: 0,
    spinId: 'spin-' + Date.now()
  }
}, '*');

// W2W: Bonus spin (free spin - betAmount is 0)
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'SPIN_REQUEST',
  payload: {
    betAmount: 0,
    reserved: 1,  // 1 indicates bonus spin
    spinId: 'spin-' + Date.now()
  }
}, '*');
```

**Response:** You'll receive either:
- `SPIN_SUBMITTED` - Spin was accepted and submitted to blockchain
- `OUTCOME` - Final outcome when spin completes (~3 seconds)
- `ERROR` - If spin failed

#### GET_BALANCE

Get current wallet balance. The bridge will refresh the balance from the blockchain before responding. If the refresh fails, it will fall back to the cached state balance.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'GET_BALANCE';
}
```

**Response:** `BALANCE_RESPONSE`

**Note:** The balance is refreshed from the blockchain on each request to ensure accuracy.

#### GET_CREDIT_BALANCE `[W2W]`

Get current credit balance, bonus spins, and spin count. Only available for W2W (ways-to-win) games.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'GET_CREDIT_BALANCE';
}
```

**Response:** `CREDIT_BALANCE`

**Note:** This message type is specific to W2W games which use a credit-based system instead of microVOI. 5reel games should use `GET_BALANCE` instead.

#### GET_CONFIG

Get game configuration (bet limits, RTP, etc.).

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'GET_CONFIG';
}
```

**Response:** `CONFIG`

#### GET_SPIN_QUEUE `[Both]`

Get current spin queue state. The queue contains all pending and recently completed spins.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'GET_SPIN_QUEUE';
}
```

**Response:** `SPIN_QUEUE`

**Note:** The spin queue is also automatically sent:
- On initialization (with INIT response)
- When a new spin is added to the queue
- When a spin status changes (submitted, completed, failed)

#### INIT

Initialize connection and get initial state.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'INIT';
  payload?: {
    contractId?: string;
  };
}
```

**Response:** `BALANCE_RESPONSE`, `CONFIG`, `SPIN_QUEUE`, and `ORIENTATION`

**Note:** On initialization, the bridge sends the current spin queue state and device orientation, allowing games to restore their state and configure their layout appropriately.

#### EXIT

Request to exit the game and navigate back to the game lobby. This allows games to implement their own exit/close buttons.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'EXIT';
}
```

**Response:** None (navigation occurs immediately)

**Example:**
```javascript
// User clicks exit button in game
function onExitButtonClicked() {
  window.parent.postMessage({
    namespace: 'com.houseofvoi',
    type: 'EXIT'
  }, '*');
}

### Response Messages (Bridge → Game)

#### OUTCOME `[Both]`

Spin outcome with grid and winnings. Includes current balance state after the outcome (with any winnings applied). The payload format differs based on game type:

**Common Fields (both game types):**
```typescript
{
  namespace: 'com.houseofvoi';
  type: 'OUTCOME';
  payload: {
    spinId: string;
    grid: string[][];      // 3x5 grid (5 reels × 3 symbols per reel)
    winnings: number;      // [5reel] microVOI, [W2W] credits
    isWin: boolean;
    winLevel: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
    totalBet: number;      // [5reel] microVOI, [W2W] credits
    availableBalance: number;  // Balance after outcome (with winnings applied, normalized VOI)
    reserved: number;          // Remaining reserved for other pending spins (normalized VOI)
    // ... plus game-type-specific fields below
  };
}
```

**Balance Fields:**
- `availableBalance`: The on-chain balance after this spin's winnings have been applied, minus any reserved amounts for other pending spins. This is the player's current spendable balance.
- `reserved`: The total amount still reserved for other pending spins (this completed spin's bet is no longer reserved). When all spins complete, this returns to 0.

**`[5reel]` Additional Fields:**
```typescript
{
  // ... common fields above
  winningLines: Array<{
    paylineIndex: number;
    symbol: string;
    matchCount: number;
    payout: number;      // microVOI
  }>;
  betPerLine: number;
  paylines: number;
}
```

**`[W2W]` Additional Fields:**
```typescript
{
  // ... common fields above
  waysWins: Array<{
    symbol: string;
    ways: number;          // Number of ways this symbol won
    matchLength: number;   // Consecutive reels matched (3, 4, or 5)
    payout: number;        // Credits
  }>;
  betAmount: number;
  bonusSpinsAwarded: number;  // 8 if 2+ BONUS symbols triggered
  jackpotHit: boolean;        // true if 3+ HOV symbols
  jackpotAmount?: number;     // Credits (only present if jackpotHit is true)
}
```

**`[5reel]` Example:**
```javascript
function handleOutcome(payload) {
  console.log('Spin result:', payload);

  // Animate reels to final grid
  animateReelsToGrid(payload.grid);

  if (payload.isWin) {
    // Celebrate win
    celebrateWin(payload.winLevel, payload.winnings);

    // Highlight winning paylines
    payload.winningLines.forEach(line => {
      highlightPayline(line.paylineIndex);
    });
  }
}
```

**`[W2W]` Example:**
```javascript
function handleOutcome(payload) {
  console.log('Spin result:', payload);

  // Animate reels to final grid
  animateReelsToGrid(payload.grid);

  if (payload.isWin) {
    // Celebrate win
    celebrateWin(payload.winLevel, payload.winnings);

    // Show ways wins
    payload.waysWins.forEach(win => {
      showWaysWin(win.symbol, win.ways, win.payout);
    });
  }

  // Handle bonus spins
  if (payload.bonusSpinsAwarded > 0) {
    showBonusSpinAward(payload.bonusSpinsAwarded);
  }

  // Handle jackpot
  if (payload.jackpotHit) {
    celebrateJackpot(payload.jackpotAmount);
  }
}
```

#### BALANCE_UPDATE

Balance changed (sent automatically when balance updates after spins or other transactions).

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'BALANCE_UPDATE';
  payload: {
    balance: number;           // Total balance in microVOI
    availableBalance: number;  // Available balance (excluding pending spins) in microVOI
  };
}
```

**Note:** `availableBalance` represents the balance available for new spins (total balance minus any pending spin bets). If no spins are pending, `availableBalance` equals `balance`.

#### BALANCE_RESPONSE

Response to GET_BALANCE request. The balance is refreshed from the blockchain before sending. If the refresh fails, the cached state balance is sent as a fallback.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'BALANCE_RESPONSE';
  payload: {
    balance: number;           // Total balance in microVOI
    availableBalance: number;  // Available balance (excluding pending spins) in microVOI
  };
}
```

**Note:** `availableBalance` represents the balance available for new spins (total balance minus any pending spin bets). If no spins are pending, `availableBalance` equals `balance`. The balance is always refreshed from the blockchain on each GET_BALANCE request to ensure accuracy.

#### CREDIT_BALANCE `[W2W]`

Response to GET_CREDIT_BALANCE request. Only available for W2W (ways-to-win) games.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'CREDIT_BALANCE';
  payload: {
    credits: number;       // Available credits for betting
    bonusSpins: number;    // Remaining free bonus spins
    spinCount: number;     // Total spins played
  };
}
```

**Example:**
```javascript
function handleCreditBalance(payload) {
  console.log('Credits:', payload.credits);
  console.log('Bonus spins:', payload.bonusSpins);
  console.log('Total spins:', payload.spinCount);

  updateCreditDisplay(payload.credits);

  if (payload.bonusSpins > 0) {
    showBonusSpinsRemaining(payload.bonusSpins);
  }
}
```

#### CONFIG `[Both]`

Game configuration response. The payload format differs based on game type:

**Common Fields (both game types):**
```typescript
{
  namespace: 'com.houseofvoi';
  type: 'CONFIG';
  payload: {
    contractId: string;
    minBet: number;        // [5reel] microVOI, [W2W] credits
    maxBet: number;        // [5reel] microVOI, [W2W] credits
    rtpTarget: number;     // e.g., 96.5
    houseEdge: number;     // e.g., 3.5
    // ... plus game-type-specific fields below
  };
}
```

**`[5reel]` Additional Fields:**
```typescript
{
  // ... common fields above
  maxPaylines: number;     // Maximum paylines (typically 20)
}
```

**`[W2W]` Additional Fields:**
```typescript
{
  // ... common fields above
  jackpotAmount: number;          // Jackpot payout in credits
  bonusSpinMultiplier: number;    // Multiplier for bonus spin payouts
}
```

#### SPIN_SUBMITTED

Spin was submitted to blockchain (waiting for outcome). Includes current balance state after deducting the spin cost.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'SPIN_SUBMITTED';
  payload: {
    spinId: string;
    txId?: string;
    availableBalance: number;  // Balance after spin cost deducted (normalized VOI)
    reserved: number;          // Total amount reserved for all pending spins (normalized VOI)
  };
}
```

**Balance Fields:**
- `availableBalance`: The on-chain balance minus all reserved amounts for pending spins. This is what the player can bet with for the next spin.
- `reserved`: The total amount currently allocated to pending spins (including this one). When all spins complete, this returns to 0.

#### SPIN_QUEUE `[Both]`

Current spin queue state. Contains all pending and recently completed spins. This message is sent:
- In response to `GET_SPIN_QUEUE` request
- On initialization
- When a spin is added, submitted, completed, or fails

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'SPIN_QUEUE';
  payload: {
    queue: Array<{
      spinId: string;           // Engine-assigned spin ID
      clientSpinId?: string;    // Client-generated ID for tracking
      betAmount: number;        // Token amount (normalized, e.g., 40 not 40000000)
      mode?: number;            // [W2W] 0=bonus, 1=credit, 2=network token, 4=ARC200 token
      paylines?: number;        // [5reel] Number of paylines
      betPerLine?: number;      // [5reel] Normalized token amount per line
      timestamp: number;        // Unix timestamp when spin was queued
      status: 'pending' | 'submitted' | 'completed' | 'failed';
      outcome?: {
        grid?: string[][];      // 3x5 grid result
        winnings: number;       // Token amount (normalized)
        isWin: boolean;
        winLevel?: 'none' | 'small' | 'medium' | 'large' | 'jackpot';
        // [W2W] specific
        waysWins?: Array<{
          symbol: string;
          ways: number;
          matchLength: number;
          payout: number;       // Token amount (normalized)
        }>;
        bonusSpinsAwarded?: number;
        jackpotHit?: boolean;
        jackpotAmount?: number; // Token amount (normalized)
        // [5reel] specific
        winningLines?: Array<{
          paylineIndex: number;
          symbol: string;
          matchCount: number;
          payout: number;       // Token amount (normalized)
        }>;
      };
      error?: string;           // Error message if status is 'failed'
    }>;
    pendingCount: number;       // Number of pending/submitted spins
    reservedBalance: number;    // Token amount reserved for pending spins (normalized)
  };
}
```

**Spin Status Flow:**
1. `pending` - Spin queued locally, waiting to be sent to blockchain
2. `submitted` - Spin transaction submitted to blockchain, waiting for confirmation
3. `completed` - Spin confirmed, outcome available
4. `failed` - Spin failed (error message in `error` field)

**Example Usage:**
```javascript
// Listen for queue updates
window.addEventListener('message', (event) => {
  const message = event.data;

  // Filter by namespace
  if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
    return;
  }

  if (message.type === 'SPIN_QUEUE') {
    const { queue, pendingCount, reservedBalance } = message.payload;

    // Update UI with queue state
    updateQueueDisplay(queue);

    // Show pending count indicator
    showPendingSpins(pendingCount);

    // Update available balance display
    // (available = total - reservedBalance)
  }
});

// Request current queue state
window.parent.postMessage({
  namespace: 'com.houseofvoi',
  type: 'GET_SPIN_QUEUE'
}, '*');
```

#### ORIENTATION `[Both]`

Device orientation and viewport dimensions. This message is sent automatically:
- On initialization (with INIT response)
- When device orientation changes (portrait ↔ landscape)
- When viewport dimensions change (e.g., window resize)

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'ORIENTATION';
  payload: {
    orientation: 'portrait' | 'landscape';
    width: number;   // Viewport width in pixels
    height: number;  // Viewport height in pixels
  };
}
```

**Example:**
```javascript
function handleOrientation(payload) {
  console.log('Orientation:', payload.orientation);
  console.log('Viewport:', payload.width, 'x', payload.height);

  if (payload.orientation === 'portrait') {
    // Adjust UI for portrait mode
    showPortraitLayout();
  } else {
    // Adjust UI for landscape mode
    showLandscapeLayout();
  }

  // Optionally resize game canvas to fit viewport
  resizeGameCanvas(payload.width, payload.height);
}
```

**Notes:**
- The orientation is determined by comparing viewport dimensions (height > width = portrait)
- Messages are only sent when orientation or dimensions actually change
- Use this to adapt your game UI for different screen orientations
- On mobile devices, this helps detect when users rotate their device

#### ERROR

Error occurred.

```typescript
{
  namespace: 'com.houseofvoi';
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
    requestId?: string;
  };
}
```

**Error Codes:**
- `NOT_INITIALIZED` - Bridge not initialized
- `INSUFFICIENT_BALANCE` - Not enough funds
- `INVALID_REQUEST` - Invalid request format or parameters
- `RATE_LIMIT` - Too many spin requests
- `ALREADY_SPINNING` - A spin is already in progress
- `SPIN_FAILED` - Spin transaction failed
- `NETWORK_ERROR` - Blockchain connection error
- `UNAUTHORIZED_ORIGIN` - Message from unauthorized origin

## Complete Example

### Unity Integration

```csharp
using UnityEngine;
using System.Runtime.InteropServices;

public class SlotMachineBridge : MonoBehaviour
{
    [DllImport("__Internal")]
    private static extern void SendSpinRequest(int paylines, int betPerLine);

    [DllImport("__Internal")]
    private static extern void SendGetBalance();

    void Start()
    {
        // Listen for messages from parent
        Application.ExternalCall("setupMessageListener");
    }

    public void OnSpinButtonClicked()
    {
        int paylines = 20;
        int betPerLine = 1000000; // 1 VOI
        SendSpinRequest(paylines, betPerLine);
    }

    // Called from JavaScript
    public void OnOutcomeReceived(string outcomeJson)
    {
        // Parse JSON and animate reels
        var outcome = JsonUtility.FromJson<Outcome>(outcomeJson);
        AnimateReels(outcome.grid);
        
        if (outcome.isWin)
        {
            CelebrateWin(outcome.winLevel, outcome.winnings);
        }
    }
}
```

**JavaScript Bridge (in Unity's index.html):**
```javascript
function SendSpinRequest(paylines, betPerLine) {
  window.parent.postMessage({
    namespace: 'com.houseofvoi',
    type: 'SPIN_REQUEST',
    payload: { paylines, betPerLine }
  }, '*');
}

function SendGetBalance() {
  window.parent.postMessage({
    namespace: 'com.houseofvoi',
    type: 'GET_BALANCE'
  }, '*');
}

// Listen for responses
window.addEventListener('message', (event) => {
  const message = event.data;

  // Filter by namespace
  if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
    return;
  }

  if (message.type === 'OUTCOME') {
    SendMessage('SlotMachineBridge', 'OnOutcomeReceived', JSON.stringify(message.payload));
  } else if (message.type === 'BALANCE_UPDATE') {
    SendMessage('SlotMachineBridge', 'OnBalanceUpdated', message.payload.balance);
  } else if (message.type === 'ERROR') {
    SendMessage('SlotMachineBridge', 'OnError', message.payload.message);
  }
});
```

### Phaser Integration

```javascript
class SlotMachineScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SlotMachineScene' });
    this.balance = 0;
    this.config = null;
  }

  create() {
    // Set up message listener
    window.addEventListener('message', (event) => {
      const message = event.data;

      // Filter by namespace
      if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
        return;
      }

      this.handleMessage(message);
    });

    // Initialize connection
    this.sendMessage({ type: 'INIT' });

    // Create UI
    this.createSpinButton();
    this.createBalanceDisplay();
  }

  sendMessage(message) {
    window.parent.postMessage({
      ...message,
      namespace: 'com.houseofvoi'
    }, '*');
  }

  handleMessage(message) {
    switch (message.type) {
      case 'OUTCOME':
        this.handleOutcome(message.payload);
        break;
      case 'BALANCE_UPDATE':
        this.updateBalance(message.payload.balance);
        break;
      case 'CONFIG':
        this.config = message.payload;
        break;
      case 'ERROR':
        this.showError(message.payload.message);
        break;
    }
  }

  onSpinClicked() {
    this.sendMessage({
      type: 'SPIN_REQUEST',
      payload: {
        paylines: 20,
        betPerLine: 1_000_000
      }
    });

    // Start spinning animation
    this.startSpinAnimation();
  }

  handleOutcome(payload) {
    // Stop spinning animation
    this.stopReelsOnGrid(payload.grid);

    if (payload.isWin) {
      this.celebrateWin(payload.winLevel, payload.winnings);
    }
  }
}
```

### Plain JavaScript/HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>Slot Machine Game</title>
</head>
<body>
  <div id="game"></div>
  <button id="spinBtn">SPIN</button>
  <div id="balance">Balance: Loading...</div>

  <script>
    let balance = 0;

    // Listen for messages
    window.addEventListener('message', (event) => {
      const message = event.data;

      // Filter by namespace
      if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
        return;
      }

      switch (message.type) {
        case 'OUTCOME':
          handleOutcome(message.payload);
          break;
        case 'BALANCE_UPDATE':
          updateBalance(message.payload.balance);
          break;
        case 'CONFIG':
          console.log('Config:', message.payload);
          break;
        case 'ERROR':
          alert('Error: ' + message.payload.message);
          break;
      }
    });

    // Send messages
    function sendMessage(message) {
      window.parent.postMessage({
        ...message,
        namespace: 'com.houseofvoi'
      }, '*');
    }

    // Initialize
    sendMessage({ type: 'INIT' });

    // Spin button
    document.getElementById('spinBtn').addEventListener('click', () => {
      sendMessage({
        type: 'SPIN_REQUEST',
        payload: {
          paylines: 20,
          betPerLine: 1_000_000
        }
      });
    });

    function handleOutcome(payload) {
      console.log('Outcome:', payload);
      // Animate reels, celebrate wins, etc.
    }

    function updateBalance(newBalance) {
      balance = newBalance;
      document.getElementById('balance').textContent =
        `Balance: ${(balance / 1_000_000).toFixed(2)} VOI`;
    }
  </script>
</body>
</html>
```

### W2W (Ways-to-Win) Integration `[W2W]`

```html
<!DOCTYPE html>
<html>
<head>
  <title>W2W Slot Machine Game</title>
  <style>
    .bonus-indicator { color: gold; font-weight: bold; }
    .jackpot-indicator { color: red; font-size: 24px; }
  </style>
</head>
<body>
  <div id="game"></div>
  <button id="spinBtn">SPIN (40 credits)</button>
  <button id="kickerSpinBtn">KICKER SPIN (60 credits)</button>
  <div id="credits">Credits: Loading...</div>
  <div id="bonusSpins" class="bonus-indicator"></div>
  <div id="jackpot" class="jackpot-indicator"></div>

  <script>
    let credits = 0;
    let bonusSpins = 0;
    let isSpinning = false;

    // Listen for messages
    window.addEventListener('message', (event) => {
      const message = event.data;

      // Filter by namespace
      if (!message || typeof message !== 'object' || message.namespace !== 'com.houseofvoi') {
        return;
      }

      switch (message.type) {
        case 'OUTCOME':
          handleOutcome(message.payload);
          break;
        case 'CREDIT_BALANCE':
          updateCredits(message.payload);
          break;
        case 'CONFIG':
          console.log('Config:', message.payload);
          console.log('Jackpot amount:', message.payload.jackpotAmount);
          break;
        case 'ERROR':
          alert('Error: ' + message.payload.message);
          isSpinning = false;
          break;
        case 'SPIN_SUBMITTED':
          console.log('Spin submitted:', message.payload.spinId);
          console.log('Available balance:', message.payload.availableBalance);
          console.log('Reserved for pending spins:', message.payload.reserved);
          break;
      }
    });

    // Send messages
    function sendMessage(message) {
      window.parent.postMessage({
        ...message,
        namespace: 'com.houseofvoi'
      }, '*');
    }

    // Initialize
    sendMessage({ type: 'INIT' });
    sendMessage({ type: 'GET_CREDIT_BALANCE' });

    // Regular spin button (40 credits)
    document.getElementById('spinBtn').addEventListener('click', () => {
      if (isSpinning) return;

      // Use bonus spin if available, otherwise regular spin
      if (bonusSpins > 0) {
        spinBonus();
      } else {
        spin(40);
      }
    });

    // Kicker spin button (60 credits)
    document.getElementById('kickerSpinBtn').addEventListener('click', () => {
      if (isSpinning) return;
      spin(60);
    });

    function spin(betAmount) {
      if (credits < betAmount) {
        alert('Insufficient credits');
        return;
      }

      isSpinning = true;
      sendMessage({
        type: 'SPIN_REQUEST',
        payload: {
          betAmount: betAmount,
          reserved: 0,  // Regular spin
          spinId: 'spin-' + Date.now()
        }
      });
    }

    function spinBonus() {
      isSpinning = true;
      sendMessage({
        type: 'SPIN_REQUEST',
        payload: {
          betAmount: 0,
          reserved: 1,  // Bonus spin
          spinId: 'bonus-' + Date.now()
        }
      });
    }

    function handleOutcome(payload) {
      console.log('Outcome:', payload);
      isSpinning = false;

      // Update balance display from outcome (no need to wait for separate update)
      console.log('Balance after outcome:', payload.availableBalance);
      console.log('Still reserved for other spins:', payload.reserved);

      // Animate reels to final grid
      animateReelsToGrid(payload.grid);

      if (payload.isWin) {
        // Celebrate win
        celebrateWin(payload.winLevel, payload.winnings);

        // Show ways wins
        payload.waysWins.forEach(win => {
          console.log(`${win.symbol}: ${win.ways} ways, ${win.matchLength} reels, ${win.payout} credits`);
        });
      }

      // Handle bonus spins awarded
      if (payload.bonusSpinsAwarded > 0) {
        alert(`🎉 ${payload.bonusSpinsAwarded} BONUS SPINS AWARDED!`);
      }

      // Handle jackpot
      if (payload.jackpotHit) {
        alert(`🎰 JACKPOT! You won ${payload.jackpotAmount} credits!`);
        document.getElementById('jackpot').textContent =
          `JACKPOT WON: ${payload.jackpotAmount} credits!`;
      }

      // Refresh credit balance
      sendMessage({ type: 'GET_CREDIT_BALANCE' });
    }

    function updateCredits(payload) {
      credits = payload.credits;
      bonusSpins = payload.bonusSpins;

      document.getElementById('credits').textContent =
        `Credits: ${credits}`;

      if (bonusSpins > 0) {
        document.getElementById('bonusSpins').textContent =
          `🎁 ${bonusSpins} Bonus Spins Available!`;
        document.getElementById('spinBtn').textContent =
          `FREE BONUS SPIN (${bonusSpins} remaining)`;
      } else {
        document.getElementById('bonusSpins').textContent = '';
        document.getElementById('spinBtn').textContent = 'SPIN (40 credits)';
      }
    }

    function animateReelsToGrid(grid) {
      // Animate reels (implementation depends on your game engine)
      console.log('Grid:', grid);
    }

    function celebrateWin(winLevel, winnings) {
      // Celebrate based on win level
      console.log(`Win: ${winLevel} - ${winnings} credits`);
    }
  </script>
</body>
</html>
```

## Best Practices

### 1. Always Handle Errors

```javascript
window.addEventListener('message', (event) => {
  const message = event.data;
  
  if (message.type === 'ERROR') {
    if (message.payload.recoverable) {
      // Show retry option
      showRetryButton();
    } else {
      // Show fatal error
      showFatalError(message.payload.message);
    }
  }
});
```

### 2. Validate Balance Before Spinning

**`[5reel]` Validate microVOI Balance:**
```javascript
function canSpin(paylines, betPerLine) {
  const totalBet = paylines * betPerLine;
  return balance >= totalBet;
}

function spin() {
  if (!canSpin(20, 1_000_000)) {
    alert('Insufficient balance');
    return;
  }

  sendMessage({
    type: 'SPIN_REQUEST',
    payload: { paylines: 20, betPerLine: 1_000_000 }
  });
}
```

**`[W2W]` Validate Credits or Bonus Spins:**
```javascript
function canSpin(betAmount) {
  // Can spin if we have bonus spins OR enough credits
  return bonusSpins > 0 || credits >= betAmount;
}

function spin(betAmount) {
  if (!canSpin(betAmount)) {
    alert('Insufficient credits');
    return;
  }

  // Use bonus spin if available
  if (bonusSpins > 0) {
    sendMessage({
      type: 'SPIN_REQUEST',
      payload: { betAmount: 0, reserved: 1 }  // Bonus spin
    });
  } else {
    sendMessage({
      type: 'SPIN_REQUEST',
      payload: { betAmount: betAmount, reserved: 0 }  // Regular spin
    });
  }
}
```

### 3. Track Spin State

```javascript
let isSpinning = false;

function spin() {
  if (isSpinning) return;
  
  isSpinning = true;
  disableSpinButton();
  
  sendMessage({
    type: 'SPIN_REQUEST',
    payload: { paylines: 20, betPerLine: 1_000_000 }
  });
}

function handleOutcome(payload) {
  isSpinning = false;
  enableSpinButton();
  // ... handle outcome
}
```

### 4. Use Spin IDs for Tracking

```javascript
let pendingSpins = new Map();

function spin() {
  const spinId = 'spin-' + Date.now();
  
  pendingSpins.set(spinId, {
    timestamp: Date.now(),
    paylines: 20,
    betPerLine: 1_000_000
  });
  
  sendMessage({
    type: 'SPIN_REQUEST',
    payload: {
      paylines: 20,
      betPerLine: 1_000_000,
      spinId: spinId
    }
  });
}

function handleOutcome(payload) {
  const spin = pendingSpins.get(payload.spinId);
  if (spin) {
    console.log('Spin completed:', spin);
    pendingSpins.delete(payload.spinId);
  }
}
```

### 5. Handle Different Outcome Formats `[Both]`

Detect and handle game-type-specific outcome fields:

```javascript
function handleOutcome(payload) {
  // Common handling for both game types
  animateReelsToGrid(payload.grid);

  if (payload.isWin) {
    celebrateWin(payload.winLevel, payload.winnings);
  }

  // Game-type-specific handling
  if ('winningLines' in payload) {
    // 5reel game - highlight paylines
    payload.winningLines.forEach(line => {
      highlightPayline(line.paylineIndex);
      console.log(`Line ${line.paylineIndex}: ${line.symbol} × ${line.matchCount} = ${line.payout} microVOI`);
    });
  } else if ('waysWins' in payload) {
    // W2W game - show ways wins
    payload.waysWins.forEach(win => {
      showWaysWin(win.symbol, win.ways, win.payout);
      console.log(`${win.symbol}: ${win.ways} ways, ${win.matchLength} reels = ${win.payout} credits`);
    });

    // Handle W2W special features
    if (payload.bonusSpinsAwarded > 0) {
      showBonusSpinAward(payload.bonusSpinsAwarded);
    }

    if (payload.jackpotHit) {
      celebrateJackpot(payload.jackpotAmount);
    }
  }
}
```

### 6. Track Credit Balance for W2W Games `[W2W]`

Always refresh credit balance after spins and handle bonus spins:

```javascript
let credits = 0;
let bonusSpins = 0;

// Request credit balance after every spin
function handleOutcome(payload) {
  // ... handle outcome ...

  // Refresh credit balance
  sendMessage({ type: 'GET_CREDIT_BALANCE' });
}

// Update UI when credit balance changes
function handleCreditBalance(payload) {
  credits = payload.credits;
  bonusSpins = payload.bonusSpins;

  updateCreditDisplay(credits);

  // Update spin button based on bonus spins
  if (bonusSpins > 0) {
    enableFreeSpinMode(bonusSpins);
  } else {
    enableRegularSpinMode();
  }
}
```

### 7. Handle Orientation Changes `[Both]`

Adapt your game layout based on device orientation and viewport size:

```javascript
let currentOrientation = null;
let viewportWidth = 0;
let viewportHeight = 0;

function handleOrientation(payload) {
  const orientationChanged = payload.orientation !== currentOrientation;

  currentOrientation = payload.orientation;
  viewportWidth = payload.width;
  viewportHeight = payload.height;

  if (orientationChanged) {
    // Reconfigure game layout for new orientation
    if (currentOrientation === 'portrait') {
      configurePortraitLayout();
    } else {
      configureLandscapeLayout();
    }
  }

  // Always update canvas/game size to fit viewport
  resizeGame(viewportWidth, viewportHeight);
}

function configurePortraitLayout() {
  // Stack controls below reels
  // Use larger touch targets
  // Consider hiding secondary UI elements
}

function configureLandscapeLayout() {
  // Place controls beside reels
  // Show full UI
}
```

**Tips:**
- Store the initial orientation from the INIT response
- Pause animations during orientation transitions
- Consider using CSS media queries in addition to JS handling
- Test on both mobile and desktop browsers

## Security Considerations

1. **Origin Validation**: Always validate message origins in production
2. **Message Validation**: Validate all incoming messages before processing
3. **Rate Limiting**: The bridge enforces rate limiting (1 spin per second)
4. **Balance Checking**: Always check balance before allowing spins
5. **Error Handling**: Handle all error cases gracefully

## Testing

Test your integration using the game page:

```
https://houseofvoi.com/games/slots?mode=external&url=<your-test-game-url>
```

Make sure your game:
- Listens for postMessage events
- Sends proper request messages
- Handles all response types
- Displays errors appropriately
- Updates balance when received

## Frequently Asked Questions

### How do I know which game type I'm integrating with?

Check the `CONFIG` message payload. If it contains `maxPaylines`, it's a 5reel game. If it contains `jackpotAmount` and `bonusSpinMultiplier`, it's a W2W game.

```javascript
window.addEventListener('message', (event) => {
  if (event.data.type === 'CONFIG') {
    if ('maxPaylines' in event.data.payload) {
      console.log('5reel game detected');
    } else if ('jackpotAmount' in event.data.payload) {
      console.log('W2W game detected');
    }
  }
});
```

### What's the difference between credits and microVOI?

- **microVOI** `[5reel]`: Blockchain currency. 1 VOI = 1,000,000 microVOI. Used for 5reel games with real blockchain transactions.
- **Credits** `[W2W]`: Game-specific currency for W2W games. Credits are managed by the game system and may have different conversion rates.

### How do bonus spins work in W2W games?

When you receive an `OUTCOME` with `bonusSpinsAwarded > 0`, those free spins are added to the player's balance. Use `GET_CREDIT_BALANCE` to check remaining bonus spins. To use a bonus spin, send a `SPIN_REQUEST` with `betAmount: 0` and `reserved: 1`.

### What happens if I send the wrong message format?

The bridge will validate your request and return an `ERROR` message with code `INVALID_REQUEST`. Make sure to:
- Use `paylines` + `betPerLine` for 5reel games
- Use `betAmount` + `reserved` for W2W games
- Check the `CONFIG` message to determine which format to use

### What's the grid size for each game type?

Both game types currently use a **3x5 grid** (3 rows × 5 reels). The `grid` array in the `OUTCOME` message will have 5 sub-arrays, each containing 3 symbols.

### How are wins calculated differently between game types?

- **5reel**: Wins are calculated based on predefined paylines (1-20). Each winning payline is listed in `winningLines[]`.
- **W2W**: Wins are calculated based on adjacent symbols from left to right across any position on consecutive reels. Each unique win is listed in `waysWins[]` with the number of ways it occurred.

## Next Steps

- [Game Mechanics](./03-game-mechanics.md) - Understand how the slot machine works
- [Integration Guide](./04-integration-guide.md) - Platform-specific integration examples
- [API Reference](./02-api-reference.md) - Complete API documentation (for reference)

## Support

- **Email:** dev@houseofvoi.com
- **Discord:** [Join our server](https://discord.gg/houseofvoi)

