# 🔧 Settings Persistence & Audit System Plan

## 🐛 **ПРОБЛЕМЫ**

1. **Настройки не сохраняются** - При переключении режима торговли изменения не сохраняются в БД
2. **Нет синхронизации** - Dashboard не обновляется при изменении настроек
3. **Нет аудита** - Отсутствует система логирования изменений
4. **Нет автоочистки** - Audit logs накапливаются без удаления

---

## 🎯 **ПЛАН РЕШЕНИЯ**

### **1. 🔧 Исправление сохранения настроек**

#### **A. Обновление Settings.tsx:**
- Добавить `trading_mode` в сохранение настроек
- Добавить валидацию режима торговли
- Добавить обработку ошибок сохранения

#### **B. Обновление user_settings таблицы:**
- Убедиться, что все поля для режима торговли существуют
- Добавить индексы для быстрого поиска
- Добавить триггеры для автоматического обновления

### **2. 📊 Создание системы Audit Log**

#### **A. Создание таблицы audit_logs:**
```sql
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, -- 'settings_change', 'strategy_change', 'position_change'
  entity_type TEXT NOT NULL, -- 'user_settings', 'strategy', 'position'
  entity_id UUID, -- ID изменяемой сущности
  old_values JSONB, -- Старые значения
  new_values JSONB, -- Новые значения
  changed_fields TEXT[], -- Массив измененных полей
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **B. Создание триггеров для автоматического логирования:**
- Триггер на `user_settings` для логирования изменений
- Триггер на `strategies` для логирования изменений стратегий
- Триггер на `positions` для логирования изменений позиций

### **3. 🗑️ Создание системы автоочистки**

#### **A. Создание cron job для очистки:**
```sql
-- Удаление audit logs старше 1 месяца каждый 1-го числа
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 0 1 * *', -- Каждый 1-го числа в 00:00
  $$
  DELETE FROM public.audit_logs 
  WHERE created_at < NOW() - INTERVAL '1 month';
  $$
);
```

### **4. 🔄 Создание системы синхронизации**

#### **A. Real-time обновления через WebSocket:**
- Создать Edge Function для broadcast изменений
- Обновлять Dashboard в реальном времени
- Уведомлять другие компоненты об изменениях

#### **B. Polling fallback:**
- Периодическая проверка изменений настроек
- Обновление компонентов при обнаружении изменений

---

## 🚀 **ЭТАПЫ РЕАЛИЗАЦИИ**

### **Этап 1: Исправление сохранения настроек**
1. Обновить Settings.tsx для сохранения trading_mode
2. Добавить валидацию и обработку ошибок
3. Протестировать сохранение и загрузку

### **Этап 2: Создание Audit System**
1. Создать таблицу audit_logs
2. Создать триггеры для автоматического логирования
3. Создать UI для просмотра audit logs
4. Протестировать логирование

### **Этап 3: Создание системы автоочистки**
1. Создать cron job для очистки
2. Протестировать автоочистку
3. Добавить мониторинг очистки

### **Этап 4: Создание системы синхронизации**
1. Создать WebSocket систему для real-time обновлений
2. Добавить polling fallback
3. Обновить Dashboard для синхронизации
4. Протестировать синхронизацию

---

## 📋 **ДЕТАЛЬНЫЙ ПЛАН**

### **1. 🔧 Исправление Settings.tsx**

#### **Проблемы в текущем коде:**
- `trading_mode` не сохраняется в `handleSave`
- Нет валидации режима торговли
- Нет обработки ошибок сохранения

#### **Исправления:**
```typescript
// Добавить trading_mode в сохранение
const settingsData = {
  // ... existing fields
  trading_mode: settings.trading_mode,
  use_mainnet_data: settings.use_mainnet_data,
  use_testnet_api: settings.use_testnet_api,
  paper_trading_mode: settings.paper_trading_mode,
};
```

### **2. 📊 Создание Audit System**

#### **A. Миграция для audit_logs:**
```sql
-- Создание таблицы audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Индексы для быстрого поиска
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs(entity_type);
```

#### **B. Триггер для user_settings:**
```sql
CREATE OR REPLACE FUNCTION public.audit_user_settings_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id, action_type, entity_type, entity_id,
    old_values, new_values, changed_fields
  ) VALUES (
    NEW.user_id, 'settings_change', 'user_settings', NEW.id,
    to_jsonb(OLD), to_jsonb(NEW), 
    ARRAY(SELECT key FROM jsonb_each(to_jsonb(NEW)) WHERE to_jsonb(NEW)->>key != to_jsonb(OLD)->>key)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_user_settings_trigger
  AFTER UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_user_settings_changes();
```

### **3. 🗑️ Система автоочистки**

#### **Cron job для очистки:**
```sql
SELECT cron.schedule(
  'cleanup-audit-logs',
  '0 0 1 * *', -- Каждый 1-го числа в 00:00
  $$
  DELETE FROM public.audit_logs 
  WHERE created_at < NOW() - INTERVAL '1 month';
  
  -- Логирование очистки
  INSERT INTO public.system_health_logs (service_name, status, message)
  VALUES ('audit_cleanup', 'healthy', 'Audit logs cleaned up successfully');
  $$
);
```

### **4. 🔄 Система синхронизации**

#### **A. WebSocket Edge Function:**
```typescript
// supabase/functions/settings-sync/index.ts
export default async function handler(req: Request) {
  // Broadcast изменений настроек всем подключенным клиентам
  // Обновление Dashboard в реальном времени
}
```

#### **B. Polling в Dashboard:**
```typescript
// Периодическая проверка изменений настроек
useEffect(() => {
  const interval = setInterval(() => {
    checkSettingsChanges();
  }, 30000); // Каждые 30 секунд
  
  return () => clearInterval(interval);
}, []);
```

---

## ✅ **ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ**

### **🎯 Для пользователей:**
1. **Настройки сохраняются** - Режим торговли сохраняется в БД
2. **Синхронизация работает** - Dashboard обновляется автоматически
3. **Audit доступен** - Можно просмотреть историю изменений
4. **Автоочистка** - Система не засоряется старыми логами

### **🔧 Для системы:**
1. **Надежность** - Настройки всегда актуальны
2. **Прозрачность** - Полная история изменений
3. **Производительность** - Автоматическая очистка логов
4. **Масштабируемость** - Система готова к росту

---

## 🚀 **НАЧНЕМ РЕАЛИЗАЦИЮ!**

Готов начать с **Этапа 1: Исправление сохранения настроек**.
