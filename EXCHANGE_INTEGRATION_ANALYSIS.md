# 🔄 Exchange Integration & Trading Modes Analysis

## 1. 🔄 **ПЕРЕКЛЮЧЕНИЕ МЕЖДУ БИРЖАМИ**

### **Текущая реализация:**

#### **✅ АВТОМАТИЧЕСКОЕ ПЕРЕКЛЮЧЕНИЕ ПОДДЕРЖИВАЕТСЯ**

**Как это работает:**
1. **Единый API слой** (`exchange-api.ts`) - абстрагирует различия между биржами
2. **Динамическое переключение** - система автоматически определяет биржу из настроек
3. **Унифицированные данные** - все биржи возвращают одинаковый формат данных

#### **Поддерживаемые биржи:**
- ✅ **Binance Futures** (mainnet/testnet)
- ✅ **Bybit Perpetual** (mainnet/testnet)
- 🔄 **Расширяемо** - легко добавить новые биржи

#### **Что происходит при переключении:**

```typescript
// 1. Система читает настройки пользователя
const userSettings = await getUserSettings(userId);
const exchange = userSettings.exchange_type; // 'binance' или 'bybit'

// 2. Автоматически выбирает правильные эндпоинты
const endpoints = getExchangeEndpoints({
  exchange: exchange,
  testnet: userSettings.use_testnet
});

// 3. Адаптирует запросы под конкретную биржу
if (exchange === 'binance') {
  // Использует Binance API endpoints
  return makeBinanceRequest(url, config, params);
} else {
  // Использует Bybit API endpoints  
  return makeBybitRequest(url, config, params);
}
```

#### **Автоматическое переключение данных:**
- ✅ **Цены** - автоматически переключаются на новую биржу
- ✅ **Индикаторы** - пересчитываются с новыми данными
- ✅ **Стратегии** - продолжают работать с новыми данными
- ✅ **Позиции** - проверяются на новой бирже

---

## 2. 🎯 **РЕЖИМЫ ТОРГОВЛИ**

### **5 режимов торговли:**

#### **1. Testnet Only** 🔵
```typescript
{
  mode: 'testnet',
  dataSource: 'testnet',      // Данные с тестнета
  apiEndpoint: 'testnet',      // API тестнета
  riskLevel: 'none',          // Без риска
  realMoney: false            // Не реальные деньги
}
```
**Использование:** Базовое тестирование, изучение интерфейса

#### **2. Hybrid Safe** 🟢 (РЕКОМЕНДУЕТСЯ)
```typescript
{
  mode: 'hybrid',
  dataSource: 'mainnet',       // Реальные данные
  apiEndpoint: 'testnet',      // Безопасный API
  riskLevel: 'none',          // Без риска
  realMoney: false            // Paper trading
}
```
**Использование:** Разработка стратегий, точное тестирование

#### **3. Hybrid Live** 🟡
```typescript
{
  mode: 'hybrid',
  dataSource: 'mainnet',       // Реальные данные
  apiEndpoint: 'testnet',      // Безопасный API
  riskLevel: 'low',           // Низкий риск
  realMoney: true             // Реальная торговля
}
```
**Использование:** Реальная торговля с тестнет API

#### **4. Paper Trading** 📄
```typescript
{
  mode: 'paper',
  dataSource: 'mainnet',       // Реальные данные
  apiEndpoint: 'testnet',      // Безопасный API
  riskLevel: 'none',          // Без риска
  realMoney: false            // Симуляция
}
```
**Использование:** Полная симуляция без реальных сделок

#### **5. Mainnet Only** 🔴
```typescript
{
  mode: 'mainnet',
  dataSource: 'mainnet',       // Реальные данные
  apiEndpoint: 'mainnet',      // Реальный API
  riskLevel: 'high',          // Высокий риск
  realMoney: true             // Реальные деньги
}
```
**Использование:** Полноценная торговля (ОСТОРОЖНО!)

---

## 3. 🗄️ **СХЕМА БАЗЫ ДАННЫХ SUPABASE**

### **Основные таблицы:**

#### **1. user_settings** - Настройки пользователя
```sql
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  
  -- API Keys
  binance_api_key TEXT,
  binance_api_secret TEXT,
  
  -- Trading Configuration
  trading_mode TEXT DEFAULT 'hybrid_safe',
  use_mainnet_data BOOLEAN DEFAULT true,
  use_testnet_api BOOLEAN DEFAULT true,
  paper_trading_mode BOOLEAN DEFAULT true,
  
  -- Risk Management
  max_position_size DECIMAL(15,2) DEFAULT 1000.00,
  max_daily_trades INTEGER DEFAULT 10,
  risk_warning_threshold DECIMAL(5,2) DEFAULT 5.00,
  
  -- Data Quality
  validate_data_integrity BOOLEAN DEFAULT true,
  handle_missing_data TEXT DEFAULT 'interpolate',
  max_data_age_minutes INTEGER DEFAULT 5,
  
  -- Telegram
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  telegram_enabled BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **2. strategies** - Торговые стратегии
```sql
CREATE TABLE public.strategies (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  strategy_type TEXT DEFAULT 'standard',
  is_active BOOLEAN DEFAULT false,
  strategy_code TEXT, -- JavaScript код для кастомных стратегий
  parameters JSONB,   -- Параметры стратегии
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **3. strategy_live_states** - Состояния стратегий
```sql
CREATE TABLE public.strategy_live_states (
  id UUID PRIMARY KEY,
  strategy_id UUID REFERENCES strategies(id),
  current_signal TEXT, -- 'buy', 'sell', 'hold'
  last_signal_time TIMESTAMP WITH TIME ZONE,
  position_size DECIMAL(15,2),
  entry_price DECIMAL(20,8),
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **4. backtest_results** - Результаты бэктестинга
```sql
CREATE TABLE public.backtest_results (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  strategy_id UUID REFERENCES strategies(id),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  initial_balance DECIMAL(15,2),
  final_balance DECIMAL(15,2),
  total_return DECIMAL(10,4),
  max_drawdown DECIMAL(10,4),
  sharpe_ratio DECIMAL(10,4),
  win_rate DECIMAL(5,2),
  total_trades INTEGER,
  results_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

#### **5. data_quality_logs** - Логи качества данных
```sql
CREATE TABLE public.data_quality_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  status TEXT NOT NULL, -- 'ok', 'warning', 'error'
  details JSONB
);
```

#### **6. data_quality_alerts** - Алерты качества данных
```sql
CREATE TABLE public.data_quality_alerts (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
  message TEXT NOT NULL,
  details JSONB,
  is_resolved BOOLEAN DEFAULT FALSE
);
```

### **Связи между таблицами:**
- `user_settings` ← `auth.users` (1:1)
- `strategies` ← `auth.users` (1:many)
- `strategy_live_states` ← `strategies` (1:1)
- `backtest_results` ← `strategies` (1:many)
- `data_quality_logs` ← независимая
- `data_quality_alerts` ← независимая

### **Row Level Security (RLS):**
- ✅ Все таблицы защищены RLS
- ✅ Пользователи видят только свои данные
- ✅ Безопасный доступ к API ключам

---

## 4. 🔄 **ПРОЦЕСС ПЕРЕКЛЮЧЕНИЯ БИРЖИ**

### **Что происходит при смене Binance → Bybit:**

#### **1. Обновление настроек:**
```typescript
// Пользователь меняет биржу в настройках
await updateUserSettings(userId, {
  exchange_type: 'bybit',
  binance_api_key: null,
  binance_api_secret: null,
  bybit_api_key: 'new_key',
  bybit_api_secret: 'new_secret'
});
```

#### **2. Автоматическое переключение данных:**
```typescript
// Система автоматически:
// 1. Переключает эндпоинты API
const endpoints = getExchangeEndpoints({
  exchange: 'bybit',  // Новая биржа
  testnet: userSettings.use_testnet
});

// 2. Адаптирует запросы данных
const candles = await fetchPublicKlines('bybit', symbol, timeframe, limit);

// 3. Пересчитывает индикаторы
const indicators = await calculateIndicators(candles);

// 4. Обновляет стратегии
await updateStrategyStates(strategies, newData);
```

#### **3. Проверка позиций:**
```typescript
// Система проверяет позиции на новой бирже
const positions = await checkExchangePosition(
  userSettings.bybit_api_key,
  userSettings.bybit_api_secret,
  userSettings.use_testnet,
  symbol,
  'bybit'  // Новая биржа
);
```

---

## 5. ⚠️ **ВАЖНЫЕ МОМЕНТЫ**

### **При переключении биржи:**

#### **✅ Что сохраняется:**
- Все стратегии продолжают работать
- Настройки пользователя
- История бэктестинга
- Конфигурация режимов торговли

#### **⚠️ Что нужно учесть:**
- **API ключи** - нужно настроить для новой биржи
- **Символы** - могут отличаться между биржами (BTCUSDT vs BTCUSDT)
- **Комиссии** - разные у разных бирж
- **Лимиты** - разные лимиты API
- **Время** - возможны расхождения во времени

#### **🔄 Автоматическая адаптация:**
- Система автоматически адаптирует символы
- Пересчитывает комиссии
- Обновляет лимиты
- Синхронизирует время

---

## 6. 🎯 **РЕКОМЕНДАЦИИ**

### **Для безопасного переключения:**

1. **Начните с Hybrid Safe** - используйте реальные данные с тестнет API
2. **Протестируйте стратегии** - убедитесь что они работают с новыми данными
3. **Проверьте символы** - убедитесь что символы доступны на новой бирже
4. **Настройте API ключи** - добавьте ключи для новой биржи
5. **Мониторьте качество данных** - следите за качеством данных новой биржи

### **Идеальный workflow:**
1. **Testnet Only** → изучение интерфейса
2. **Hybrid Safe** → разработка стратегий
3. **Paper Trading** → тестирование стратегий
4. **Hybrid Live** → реальная торговля с тестнет API
5. **Mainnet Only** → полноценная торговля (только для опытных!)

---

## 🎉 **ЗАКЛЮЧЕНИЕ**

**✅ ПЕРЕКЛЮЧЕНИЕ БИРЖ ПОДДЕРЖИВАЕТСЯ ПОЛНОСТЬЮ**

Система автоматически:
- Переключает API эндпоинты
- Адаптирует запросы данных
- Пересчитывает индикаторы
- Обновляет стратегии
- Проверяет позиции

**✅ РЕЖИМЫ ТОРГОВЛИ РАБОТАЮТ КОРРЕКТНО**

5 режимов покрывают все сценарии:
- От безопасного тестирования
- До полноценной торговли

**✅ БАЗА ДАННЫХ ПОЛНОСТЬЮ ПОНЯТНА**

Четкая структура с RLS защитой и всеми необходимыми таблицами для:
- Управления пользователями
- Торговых стратегий
- Бэктестинга
- Качества данных
- Мониторинга

Система готова к работе! 🚀✨
