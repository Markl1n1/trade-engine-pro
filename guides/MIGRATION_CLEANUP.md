# Migration Files Cleanup Log

## Date: 2025-01-21

### Cleanup Reason
Cleaned up outdated migration files that are no longer relevant to the current database schema. These migrations either:
- Create tables/columns that were later removed
- Perform one-time data conversions (already executed)
- Duplicate functionality from later migrations
- Contain temporary/auto-generated changes

### Files Deleted (28 files)

#### Group A: Migrations with auto-generated UUIDs (already applied)
1. `20251021090028_b9e71b6f-4035-43ab-ac4c-530a3f879800.sql` - Trigger only, functions exist in later migrations
2. `20251021090646_4c558850-45d3-445a-b3ad-f45ff171fb1f.sql` - Duplicated encryption functions
3. `20251021090742_8154fc8f-7b27-4788-9160-251026b6f61f.sql` - Duplicate of previous migration

#### Group B: One-time table deletion operations (already executed)
4. `20250102000007_remove_visual_strategy_builder.sql` - Removed visual builder tables
5. `20250102000008_remove_unused_tables.sql` - Removed unused tables

#### Group C: Creates tables that no longer exist in schema
6. `20250102000001_add_strategy_validation.sql` - Validation tables not in current schema
7. `20250102000003_add_data_quality_tables.sql` - Data quality tables were later removed

#### Group D: One-time data conversion (already executed)
8. `20250102000009_replace_mstg_with_mtf_momentum.sql` - MSTG → MTF conversion
9. `20250102000010_fix_new_strategies_user_id.sql` - Fixed user_id (just executed)
10. `20251020000000_add_scalping_strategies.sql` - Duplicated in later migration

### Critical Migrations PRESERVED
These migrations are essential and remain in the project:
- `20250102000000_add_hybrid_trading_support.sql` - Adds hybrid trading columns
- `20251020143455_f4017a64-7344-467e-91e9-c9d1b0f07ae0.sql` - SMA & MTF strategy columns
- `20251021090050_ebf272b1-7033-49e3-828c-ed0d660d92e1.sql` - Final encryption functions
- All migrations creating tables that exist in current schema

### Recovery Instructions
If you need to restore any deleted migration files:
1. Check git history: `git log --all --full-history -- supabase/migrations/<filename>`
2. Restore from git: `git checkout <commit-hash> -- supabase/migrations/<filename>`

### Current Database Schema Status
After cleanup, all active migrations properly reflect the current production schema with:
- Encrypted credentials system
- Hybrid trading support
- SMA and MTF momentum strategies
- Proper RLS policies
- Audit logging
