import { supabase } from "@/integrations/supabase/client";

export interface AuditLogEntry {
  action_type: string;
  entity_type: string;
  entity_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  changed_fields?: string[];
}

/**
 * Log a settings change to the audit log
 */
export async function logSettingsChange(
  oldValues: Record<string, any>,
  newValues: Record<string, any>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Identify changed fields
    const changedFields: string[] = [];
    const oldValuesFiltered: Record<string, any> = {};
    const newValuesFiltered: Record<string, any> = {};

    for (const key in newValues) {
      if (oldValues[key] !== newValues[key]) {
        changedFields.push(key);
        
        // Mask sensitive fields
        if (key.includes('api_key') || key.includes('api_secret') || key.includes('token') || key.includes('bot_token')) {
          oldValuesFiltered[key] = oldValues[key] ? '****' : null;
          newValuesFiltered[key] = newValues[key] ? '****' : null;
        } else {
          oldValuesFiltered[key] = oldValues[key];
          newValuesFiltered[key] = newValues[key];
        }
      }
    }

    if (changedFields.length === 0) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'UPDATE_SETTINGS',
      old_values: oldValuesFiltered,
      new_values: newValuesFiltered,
      changed_fields: changedFields
    });
  } catch (error) {
    console.error('Error logging settings change:', error);
  }
}

/**
 * Log a trading mode switch to the audit log
 */
export async function logTradingModeSwitch(oldMode: string, newMode: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'TRADING_MODE_SWITCH',
      old_values: { trading_mode: oldMode },
      new_values: { trading_mode: newMode },
      changed_fields: ['trading_mode']
    });
  } catch (error) {
    console.error('Error logging trading mode switch:', error);
  }
}

/**
 * Log strategy creation to the audit log
 */
export async function logStrategyCreate(strategyData: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'STRATEGY_CREATE',
      entity_type: 'strategy',
      entity_id: strategyData.id,
      new_values: {
        name: strategyData.name,
        strategy_type: strategyData.strategy_type,
        symbol: strategyData.symbol,
        timeframe: strategyData.timeframe,
        initial_capital: strategyData.initial_capital,
        position_size_percent: strategyData.position_size_percent
      }
    });
  } catch (error) {
    console.error('Error logging strategy creation:', error);
  }
}

/**
 * Log strategy edit to the audit log
 */
export async function logStrategyEdit(
  strategyId: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Identify changed fields
    const changedFields: string[] = [];
    const oldValuesFiltered: Record<string, any> = {};
    const newValuesFiltered: Record<string, any> = {};

    for (const key in newValues) {
      if (oldValues[key] !== newValues[key]) {
        changedFields.push(key);
        oldValuesFiltered[key] = oldValues[key];
        newValuesFiltered[key] = newValues[key];
      }
    }

    if (changedFields.length === 0) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'STRATEGY_EDIT',
      entity_type: 'strategy',
      entity_id: strategyId,
      old_values: oldValuesFiltered,
      new_values: newValuesFiltered,
      changed_fields: changedFields
    });
  } catch (error) {
    console.error('Error logging strategy edit:', error);
  }
}

/**
 * Log strategy deletion to the audit log
 */
export async function logStrategyDelete(strategyData: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'STRATEGY_DELETE',
      entity_type: 'strategy',
      entity_id: strategyData.id,
      old_values: {
        name: strategyData.name,
        strategy_type: strategyData.strategy_type,
        symbol: strategyData.symbol,
        timeframe: strategyData.timeframe
      }
    });
  } catch (error) {
    console.error('Error logging strategy deletion:', error);
  }
}

/**
 * Log strategy status change to the audit log
 */
export async function logStrategyStatusChange(
  strategyId: string,
  strategyName: string,
  oldStatus: string,
  newStatus: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'STRATEGY_STATUS_CHANGE',
      entity_type: 'strategy',
      entity_id: strategyId,
      old_values: { name: strategyName, status: oldStatus },
      new_values: { name: strategyName, status: newStatus },
      changed_fields: ['status']
    });
  } catch (error) {
    console.error('Error logging strategy status change:', error);
  }
}

/**
 * Log strategy clone to the audit log
 */
export async function logStrategyClone(sourceStrategyId: string, newStrategyData: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_settings_audit').insert({
      user_id: user.id,
      action: 'STRATEGY_CLONE',
      entity_type: 'strategy',
      entity_id: newStrategyData.id,
      old_values: { source_strategy_id: sourceStrategyId },
      new_values: {
        name: newStrategyData.name,
        strategy_type: newStrategyData.strategy_type,
        symbol: newStrategyData.symbol,
        timeframe: newStrategyData.timeframe
      }
    });
  } catch (error) {
    console.error('Error logging strategy clone:', error);
  }
}
