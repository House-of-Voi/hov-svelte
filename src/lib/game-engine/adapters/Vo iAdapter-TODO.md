# Voi Adapter Implementation TODO

The VoiSlotMachineAdapter needs to be completed to interact with the Voi blockchain contract.

## Required Implementation

### 1. Contract Client Generation
- Generate TypeScript client from the contract.py using AlgoKit
- Place generated client in `src/lib/clients/` directory
- Import APP_SPEC from the generated client

### 2. Algorand SDK Setup
- Initialize algosdk.Algodv2 client for Voi network
- Initialize algosdk.Indexer for querying blockchain state
- Configure network endpoints (mainnet/testnet)

### 3. submitSpin() Implementation
```typescript
async submitSpin(betPerLine: number, paylines: number, walletAddress: string): Promise<BetKey> {
  // 1. Get wallet signer (from CDP wallet or Algorand wallet)
  // 2. Create spin transaction using contract client
  // 3. Sign and send transaction
  // 4. Wait for confirmation
  // 5. Extract bet key from transaction logs/state
  // 6. Return BetKey with txId, submitBlock, claimBlock
}
```

### 4. claimSpin() Implementation
```typescript
async claimSpin(betKey: string): Promise<SpinOutcome> {
  // 1. Create claim transaction using contract client
  // 2. Sign and send transaction
  // 3. Wait for confirmation
  // 4. Parse outcome from transaction logs/return value
  // 5. Convert grid to SymbolId[][] format
  // 6. Use winDetection util to calculate winningLines
  // 7. Return SpinOutcome
}
```

### 5. getContractConfig() Implementation
```typescript
async getContractConfig(): Promise<SlotMachineConfig> {
  // 1. Query contract global state
  // 2. Fetch reel data (5 reels × 100 symbols each)
  // 3. Fetch payline patterns (20 patterns)
  // 4. Fetch paytable (symbol multipliers)
  // 5. Map to SlotMachineConfig type
  // 6. Cache the config (reels don't change often)
}
```

### 6. getBalance() Implementation
```typescript
async getBalance(address: string): Promise<number> {
  // 1. Query account info from algod
  // 2. Return account.amount (in microVOI)
}
```

### 7. getCurrentBlock() Implementation
```typescript
async getCurrentBlock(): Promise<number> {
  // 1. Query algod status
  // 2. Return last Round
}
```

## References

See `/Users/dave/Dev/voi/hov/house-of-voi/src/lib/services/algorand.ts` for reference implementation using:
- algosdk for blockchain interaction
- ulujs CONTRACT helper for ABI calls
- Wallet signing integration

## Dependencies

- `algosdk` - Already installed
- `@algorandfoundation/algokit-utils` - For typed contract clients
- Generated contract client from `contract.py`

## Testing Strategy

1. Start with Mock adapter for UI development
2. Test individual adapter methods with small transactions
3. Use testnet for integration testing
4. Deploy to mainnet after full validation
