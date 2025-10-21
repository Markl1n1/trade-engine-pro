# Deleted Edge Functions - Backup Documentation

## Date: 2025-01-21

### Deletion Reason
Cleaned up obsolete edge functions that are no longer relevant to the system. These functions either:
- Were one-time operations (already executed)
- Are not integrated or used in the current architecture
- Have no active usage (empty buffers/queues)

---

## Deleted Edge Functions (5 functions)

### 1. `migrate-credentials`
**Purpose**: One-time migration of plaintext API credentials to encrypted storage

**Status**: Migration completed successfully
- Reference: `guides/CREDENTIAL_ENCRYPTION_MIGRATION.md`
- All credentials migrated to `encrypted_credentials` table
- Function is no longer needed

**Original Config**:
```toml
[functions.migrate-credentials]
verify_jwt = false
```

---

### 2. `health-check`
**Purpose**: Perform health checks on signal delivery system

**Status**: Created but never integrated
- Not called from frontend or any cron jobs
- No logs showing any usage
- System health monitoring not actively used

**Features**:
- Checked Binance API reachability
- Monitored signal queues
- Logged health metrics to `system_health_logs`

---

### 3. `process-buffered-signals`
**Purpose**: Process buffered trading signals with retry logic

**Status**: Not used in current architecture
- Logs show "No buffered signals to process"
- `signal_buffer` table is empty
- Direct signal insertion is used instead

**Features**:
- Fetched unprocessed signals from `signal_buffer`
- Retry logic with exponential backoff
- Cleaned up old processed signals

---

### 4. `retry-failed-signals`
**Purpose**: Retry sending failed Telegram signal notifications

**Status**: Not used in current architecture
- Logs show "No failed signals to retry"
- Current system handles delivery inline
- Retry mechanism not needed

**Features**:
- Exponential backoff for failed signals
- Telegram message resending
- Signal expiration handling

---

### 5. `get-binance-pairs`
**Purpose**: Public endpoint to fetch Binance Futures trading pairs

**Status**: Not used in frontend
- No calls from frontend code
- Trading pairs managed differently
- Redundant functionality

**Features**:
- Fetched USDT perpetual contracts from Binance
- Filtered active trading pairs
- Returned symbol metadata

**Original Config**:
```toml
[functions.get-binance-pairs]
verify_jwt = false
```

---

## Active Edge Functions (12 functions)

After cleanup, the following core functions remain active:
1. **monitor-strategies-cron** - Main strategy monitoring and signal generation
2. **run-backtest** - Full strategy backtesting
3. **run-backtest-simple** - Simplified backtesting
4. **close-position** - Position management
5. **validate-strategy** - Strategy validation
6. **instant-signals** - Instant signal generation API
7. **binance-api-status** - API health monitoring
8. **binance-websocket-monitor** - Real-time WebSocket data
9. **get-hybrid-market-data** - Hybrid data retrieval (DB + API)
10. **get-audit-logs** - Security audit logs
11. **data-quality-monitor** - Data quality tracking
12. **test-exchange** - Exchange API testing

---

## Recovery Instructions

If you need to restore any deleted edge function:
1. Check git history: `git log --all --full-history -- supabase/functions/<function-name>/`
2. Restore from git: `git checkout <commit-hash> -- supabase/functions/<function-name>/`
3. Add function back to `supabase/config.toml` if needed

---

## Database Tables Impact

Consider reviewing these tables for cleanup:
- `signal_buffer` - May be unused (was used by process-buffered-signals)
- `system_health_logs` - May be unused (was used by health-check)
- `credential_access_log` - Still used for security auditing

---

## Notes

- All deleted functions were either one-time operations or unused features
- No impact on current production functionality
- Core trading and monitoring functions remain intact
- This cleanup reduces maintenance burden and deployment time
