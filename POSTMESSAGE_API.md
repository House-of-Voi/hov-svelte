# PostMessage API Reference

Complete guide to integrating third-party games using the postMessage communication protocol.

## Overview

Third-party games communicate with the House of Voi slot machine backend via **postMessage**. Games have **NO wallet access** - they only send spin requests and receive outcomes.

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

  switch (message.type) {
    case 'OUTCOME':
      handleOutcome(message.payload);
      break;
    case 'BALANCE_UPDATE':
      updateBalance(message.payload);
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
  }
});
```

### 3. Send Messages to Bridge

Send requests to the parent window:

```javascript
// Send spin request
window.parent.postMessage({
  type: 'SPIN_REQUEST',
  payload: {
    paylines: 20,
    betPerLine: 1_000_000, // 1 VOI in microVOI
    spinId: 'my-spin-123' // Optional
  }
}, '*'); // Use specific origin in production

// Get balance
window.parent.postMessage({
  type: 'GET_BALANCE'
}, '*');

// Get config
window.parent.postMessage({
  type: 'GET_CONFIG'
}, '*');

// Initialize connection
window.parent.postMessage({
  type: 'INIT'
}, '*');
```

## Message Types

### Request Messages (Game → Bridge)

#### SPIN_REQUEST

Request a spin with specified bet and paylines.

```typescript
{
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
window.parent.postMessage({
  type: 'SPIN_REQUEST',
  payload: {
    paylines: 20,
    betPerLine: 1_000_000, // 1 VOI per line
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
  type: 'GET_BALANCE';
}
```

**Response:** `BALANCE_RESPONSE`

**Note:** The balance is refreshed from the blockchain on each request to ensure accuracy.

#### GET_CONFIG

Get game configuration (bet limits, RTP, etc.).

```typescript
{
  type: 'GET_CONFIG';
}
```

**Response:** `CONFIG`

#### INIT

Initialize connection and get initial state.

```typescript
{
  type: 'INIT';
  payload?: {
    contractId?: string;
  };
}
```

**Response:** `BALANCE_RESPONSE` and `CONFIG`

### Response Messages (Bridge → Game)

#### OUTCOME

Spin outcome with grid and winnings.

```typescript
{
  type: 'OUTCOME';
  payload: {
    spinId: string;
    grid: string[][];      // 3x5 grid (5 reels × 3 symbols)
    winnings: number;      // microVOI
    isWin: boolean;
    winningLines: Array<{
      paylineIndex: number;
      symbol: string;
      matchCount: number;
      payout: number;      // microVOI
    }>;
    winLevel: 'small' | 'medium' | 'large' | 'jackpot';
    betPerLine: number;
    paylines: number;
    totalBet: number;
  };
}
```

**Example:**
```javascript
function handleOutcome(payload) {
  console.log('Spin result:', payload);
  
  // Animate reels to final grid
  animateReelsToGrid(payload.grid);
  
  if (payload.isWin) {
    // Celebrate win
    celebrateWin(payload.winLevel, payload.winnings);
    
    // Highlight winning lines
    payload.winningLines.forEach(line => {
      highlightPayline(line.paylineIndex);
    });
  }
}
```

#### BALANCE_UPDATE

Balance changed (sent automatically when balance updates after spins or other transactions).

```typescript
{
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
  type: 'BALANCE_RESPONSE';
  payload: {
    balance: number;           // Total balance in microVOI
    availableBalance: number;  // Available balance (excluding pending spins) in microVOI
  };
}
```

**Note:** `availableBalance` represents the balance available for new spins (total balance minus any pending spin bets). If no spins are pending, `availableBalance` equals `balance`. The balance is always refreshed from the blockchain on each GET_BALANCE request to ensure accuracy.

#### CONFIG

Game configuration response.

```typescript
{
  type: 'CONFIG';
  payload: {
    contractId: string;
    minBet: number;        // microVOI
    maxBet: number;        // microVOI
    maxPaylines: number;
    rtpTarget: number;     // e.g., 96.5
    houseEdge: number;     // e.g., 3.5
  };
}
```

#### SPIN_SUBMITTED

Spin was submitted to blockchain (waiting for outcome).

```typescript
{
  type: 'SPIN_SUBMITTED';
  payload: {
    spinId: string;
    txId?: string;
  };
}
```

#### ERROR

Error occurred.

```typescript
{
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
    type: 'SPIN_REQUEST',
    payload: { paylines, betPerLine }
  }, '*');
}

function SendGetBalance() {
  window.parent.postMessage({
    type: 'GET_BALANCE'
  }, '*');
}

// Listen for responses
window.addEventListener('message', (event) => {
  const message = event.data;
  
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
      this.handleMessage(event.data);
    });

    // Initialize connection
    this.sendMessage({ type: 'INIT' });

    // Create UI
    this.createSpinButton();
    this.createBalanceDisplay();
  }

  sendMessage(message) {
    window.parent.postMessage(message, '*');
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
      window.parent.postMessage(message, '*');
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

## Next Steps

- [Game Mechanics](./03-game-mechanics.md) - Understand how the slot machine works
- [Integration Guide](./04-integration-guide.md) - Platform-specific integration examples
- [API Reference](./02-api-reference.md) - Complete API documentation (for reference)

## Support

- **Email:** dev@houseofvoi.com
- **Discord:** [Join our server](https://discord.gg/houseofvoi)

