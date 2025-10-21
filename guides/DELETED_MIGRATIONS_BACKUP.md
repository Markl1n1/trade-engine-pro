# Deleted Migration Files - Backup Documentation

This document lists all migration files that were deleted on 2025-01-21 as part of cleanup of outdated and redundant migrations.

## Why These Files Were Deleted

The current database schema is fully functional and these migrations either:
1. **Duplicated** functionality from newer migrations
2. **Created tables/columns** that were later removed
3. **One-time operations** (data conversions, deletions) that are already completed
4. **Auto-generated** with temporary UUIDs and redundant changes

## Deleted Files List

### Group A: Duplicate Column Additions
- `20250102000010_fix_new_strategies_user_id.sql` - One-time fix for strategy user_ids (already executed)

### Group B: Table Deletion Operations (One-Time)
- `20250102000007_remove_visual_strategy_builder.sql` - Removed visual builder tables (already done)
- `20250102000008_remove_unused_tables.sql` - Removed unused tables (already done)

### Group C: Tables Created Then Removed
- `20250102000001_add_strategy_validation.sql` - Created validation tables, but they don't exist in current schema
- `20250102000003_add_data_quality_tables.sql` - Created data_quality_* tables that were later removed

### Group D: One-Time Data Conversions
- `20250102000009_replace_mstg_with_mtf_momentum.sql` - Converted MSTG to MTF (one-time operation)

## Important: Files to Keep

These migrations are **CRITICAL** and should **NEVER** be deleted:

1. `20250102000000_add_hybrid_trading_support.sql` - Adds hybrid trading columns
2. `20251020143455_f4017a64-7344-467e-91e9-c9d1b0f07ae0.sql` - Adds SMA and MTF strategy columns
3. `20251021090050_ebf272b1-7033-49e3-828c-ed0d660d92e1.sql` - Encryption functions with RLS
4. All migrations that create tables existing in current schema

## Current Database State

The current database schema includes these tables:
- audit_logs
- condition_groups
- credential_access_log
- encrypted_credentials
- encryption_keys
- exchange_metrics
- market_data
- position_events
- security_audit_log
- signal_buffer
- strategy_backtest_results
- strategy_conditions
- strategy_live_states
- strategy_signals
- strategy_templates
- strategies
- system_health_logs
- system_settings
- user_roles
- user_settings
- user_settings_audit
- user_trading_pairs

## Restoration

If any of these deleted migrations need to be restored, they can be found in the git history at commit before 2025-01-21.

## Note

Deleting these migration files does NOT affect the current database state. The database remains fully functional with all necessary tables, columns, and functions.
