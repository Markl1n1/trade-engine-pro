# 🎯 Trading Modes & Debugging Guide

## 🔄 **РЕЖИМЫ ТОРГОВЛИ И ДЕБАГГИНГ**

### **1. 🔵 Hybrid Safe - Разработка стратегий**

#### **Описание режима:**
- **Данные**: Реальные рыночные данные (mainnet) для точных расчетов
- **API**: Тестнет API для безопасного тестирования
- **Торговля**: Paper Trading (симуляция)
- **Риск**: Нет (безопасно)
- **Точность**: Высокая (реальные данные)

#### **Как дебажить стратегию:**

##### **📊 Мониторинг в реальном времени:**
```typescript
// 1. Performance Dashboard
- CPU Usage: отслеживайте нагрузку на систему
- Memory Usage: контролируйте использование памяти
- Network: мониторьте запросы к API
- Database: следите за производительностью БД

// 2. Risk Management Dashboard  
- Position Sizing: проверяйте размеры позиций
- Risk Metrics: отслеживайте метрики риска
- Portfolio: контролируйте портфель
- Alerts: получайте уведомления о рисках
```

##### **📝 Логирование стратегии:**
```typescript
// В Edge Functions добавьте подробное логирование:
console.log('Strategy Debug:', {
  timestamp: new Date().toISOString(),
  symbol: 'BTCUSDT',
  timeframe: '5m',
  currentPrice: candle.close,
  indicators: {
    rsi: rsiValue,
    macd: macdValue,
    bb: bbValue
  },
  conditions: {
    buyCondition: buyCondition,
    sellCondition: sellCondition
  },
  decision: signal
});
```

##### **🔍 Проверка данных:**
```typescript
// 1. Проверьте качество данных
const dataQuality = await checkDataQuality(symbol, timeframe);
console.log('Data Quality:', dataQuality);

// 2. Валидация индикаторов
const indicators = await calculateIndicators(candles);
console.log('Indicators:', indicators);

// 3. Проверка условий входа/выхода
const conditions = await checkStrategyConditions(candles, indicators);
console.log('Conditions:', conditions);
```

##### **📱 Telegram уведомления:**
- ✅ **ДА, сигналы приходят в Telegram**
- Уведомления о входах/выходах
- Алерты о рисках
- Статус стратегии

---

### **2. 📄 Paper Trading - Тестирование стратегий**

#### **Описание режима:**
- **Данные**: Реальные рыночные данные (mainnet)
- **API**: Тестнет API (безопасно)
- **Торговля**: Полная симуляция (виртуальный баланс)
- **Риск**: Нет (безопасно)
- **Точность**: Высокая (реальные данные)

#### **Как дебажить стратегию:**

##### **📊 Виртуальный мониторинг:**
```typescript
// 1. Отслеживайте виртуальный баланс
const virtualBalance = await getVirtualBalance();
console.log('Virtual Balance:', virtualBalance);

// 2. Мониторьте симулированные позиции
const virtualPositions = await getVirtualPositions();
console.log('Virtual Positions:', virtualPositions);

// 3. Проверяйте P&L
const virtualPnL = await calculateVirtualPnL();
console.log('Virtual P&L:', virtualPnL);
```

##### **📈 Бэктестинг:**
```typescript
// 1. Запустите бэктест на исторических данных
const backtestResult = await runBacktest({
  strategy: strategyId,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  initialBalance: 10000
});

// 2. Анализируйте результаты
console.log('Backtest Results:', {
  totalReturn: backtestResult.totalReturn,
  maxDrawdown: backtestResult.maxDrawdown,
  sharpeRatio: backtestResult.sharpeRatio,
  winRate: backtestResult.winRate
});
```

##### **🔍 Сравнение с реальными данными:**
```typescript
// 1. Сравните симулированные результаты с реальными
const comparison = await compareWithRealData(symbol, timeframe);
console.log('Comparison:', comparison);

// 2. Проверьте точность симуляции
const accuracy = await checkSimulationAccuracy();
console.log('Simulation Accuracy:', accuracy);
```

##### **📱 Telegram уведомления:**
- ✅ **ДА, сигналы приходят в Telegram**
- Уведомления о симулированных сделках
- Результаты бэктестинга
- Алерты о производительности

---

### **3. 🟡 Hybrid Live - Реальная торговля с тестнет API**

#### **Описание режима:**
- **Данные**: Реальные рыночные данные (mainnet)
- **API**: Тестнет API (безопасно)
- **Торговля**: Реальная торговля на тестнете
- **Риск**: Низкий (тестнет)
- **Точность**: Высокая (реальные данные)

#### **Как дебажить стратегию:**

##### **🏦 Мониторинг тестнет аккаунта:**
```typescript
// 1. Проверьте баланс на тестнете
const testnetBalance = await getTestnetBalance();
console.log('Testnet Balance:', testnetBalance);

// 2. Отслеживайте позиции на тестнете
const testnetPositions = await getTestnetPositions();
console.log('Testnet Positions:', testnetPositions);

// 3. Мониторьте ордера на тестнете
const testnetOrders = await getTestnetOrders();
console.log('Testnet Orders:', testnetOrders);
```

##### **⚡ Проверка исполнения ордеров:**
```typescript
// 1. Отслеживайте статус ордеров
const orderStatus = await checkOrderStatus(orderId);
console.log('Order Status:', orderStatus);

// 2. Проверяйте исполнение
const execution = await checkOrderExecution(orderId);
console.log('Order Execution:', execution);

// 3. Мониторьте проскальзывание
const slippage = await calculateSlippage(expectedPrice, actualPrice);
console.log('Slippage:', slippage);
```

##### **🔄 Синхронизация данных:**
```typescript
// 1. Проверьте синхронизацию с реальными данными
const syncStatus = await checkDataSync();
console.log('Data Sync Status:', syncStatus);

// 2. Мониторьте задержки
const latency = await measureLatency();
console.log('API Latency:', latency);

// 3. Проверьте качество данных
const dataQuality = await validateDataQuality();
console.log('Data Quality:', dataQuality);
```

##### **📱 Telegram уведомления:**
- ✅ **ДА, сигналы приходят в Telegram**
- Уведомления о реальных тестнет сделках
- Статус ордеров
- Алерты о проблемах

---

### **4. 🔴 Mainnet Only - Полноценная торговля**

#### **Описание режима:**
- **Данные**: Реальные рыночные данные (mainnet)
- **API**: Реальный API (mainnet)
- **Торговля**: Реальная торговля с реальными деньгами
- **Риск**: Высокий (реальные деньги)
- **Точность**: Максимальная

#### **Как дебажить стратегию:**

##### **💰 Мониторинг реального аккаунта:**
```typescript
// 1. Проверьте реальный баланс
const realBalance = await getRealBalance();
console.log('Real Balance:', realBalance);

// 2. Отслеживайте реальные позиции
const realPositions = await getRealPositions();
console.log('Real Positions:', realPositions);

// 3. Мониторьте реальные ордера
const realOrders = await getRealOrders();
console.log('Real Orders:', realOrders);
```

##### **⚠️ Критический мониторинг:**
```typescript
// 1. Отслеживайте риски в реальном времени
const riskMetrics = await calculateRealTimeRisk();
console.log('Real-time Risk:', riskMetrics);

// 2. Мониторьте просадку
const drawdown = await calculateDrawdown();
console.log('Current Drawdown:', drawdown);

// 3. Проверяйте лимиты
const limits = await checkTradingLimits();
console.log('Trading Limits:', limits);
```

##### **🚨 Алерты и уведомления:**
```typescript
// 1. Настройте критические алерты
const criticalAlerts = await setupCriticalAlerts();
console.log('Critical Alerts:', criticalAlerts);

// 2. Мониторьте производительность
const performance = await monitorPerformance();
console.log('Performance:', performance);

// 3. Проверяйте безопасность
const security = await checkSecurity();
console.log('Security Status:', security);
```

##### **📱 Telegram уведомления:**
- ✅ **ДА, сигналы приходят в Telegram**
- Критические уведомления о реальных сделках
- Алерты о рисках
- Статус портфеля

---

## 📱 **TELEGRAM СИГНАЛЫ ПО РЕЖИМАМ**

### **Все режимы поддерживают Telegram уведомления:**

#### **🔵 Hybrid Safe:**
- ✅ Уведомления о тестнет сделках
- ✅ Алерты о рисках
- ✅ Статус стратегии
- ✅ Результаты бэктестинга

#### **📄 Paper Trading:**
- ✅ Уведомления о симулированных сделках
- ✅ Результаты бэктестинга
- ✅ Алерты о производительности
- ✅ Статус виртуального портфеля

#### **🟡 Hybrid Live:**
- ✅ Уведомления о тестнет сделках
- ✅ Статус ордеров
- ✅ Алерты о проблемах
- ✅ Результаты торговли

#### **🔴 Mainnet Only:**
- ✅ Критические уведомления о реальных сделках
- ✅ Алерты о рисках
- ✅ Статус портфеля
- ✅ Критические события

---

## 🛠️ **ИНСТРУМЕНТЫ ДЕБАГГИНГА**

### **1. Performance Dashboard:**
- CPU, Memory, Network мониторинг
- Database производительность
- Cache статистика
- Системные алерты

### **2. Risk Management Dashboard:**
- Метрики риска
- Position sizing
- Portfolio мониторинг
- Risk alerts

### **3. Data Quality Dashboard:**
- Качество данных
- Валидация
- Очистка данных
- Мониторинг источников

### **4. Логирование:**
```typescript
// Подробное логирование в Edge Functions
console.log('Strategy Debug:', {
  timestamp: new Date().toISOString(),
  symbol: symbol,
  timeframe: timeframe,
  currentPrice: candle.close,
  indicators: indicators,
  conditions: conditions,
  decision: signal,
  risk: riskMetrics
});
```

### **5. Telegram уведомления:**
```typescript
// Настройка Telegram бота
const telegramConfig = {
  botToken: userSettings.telegram_bot_token,
  chatId: userSettings.telegram_chat_id,
  enabled: userSettings.telegram_enabled
};

// Отправка уведомлений
await sendTelegramNotification({
  message: `Strategy ${strategyName} executed ${signal} signal`,
  timestamp: new Date().toISOString(),
  details: strategyDetails
});
```

---

## 🎯 **РЕКОМЕНДУЕМЫЙ WORKFLOW**

### **1. Hybrid Safe → Разработка**
- Создайте стратегию
- Протестируйте на реальных данных
- Отладьте логику
- Проверьте индикаторы

### **2. Paper Trading → Тестирование**
- Запустите бэктест
- Протестируйте на исторических данных
- Оцените производительность
- Проверьте риски

### **3. Hybrid Live → Реальная торговля (тестнет)**
- Протестируйте на тестнете
- Проверьте исполнение ордеров
- Мониторьте производительность
- Убедитесь в стабильности

### **4. Mainnet Only → Полноценная торговля**
- Переходите только после полного тестирования
- Начните с малых сумм
- Постоянно мониторьте
- Будьте готовы к остановке

---

## 🚀 **ЗАКЛЮЧЕНИЕ**

**✅ ВСЕ РЕЖИМЫ ПОДДЕРЖИВАЮТ ДЕБАГГИНГ:**
- Подробное логирование
- Мониторинг в реальном времени
- Performance и Risk дашборды
- Telegram уведомления

**✅ TELEGRAM СИГНАЛЫ РАБОТАЮТ ВО ВСЕХ РЕЖИМАХ:**
- От безопасного тестирования
- До полноценной торговли

**✅ ИНСТРУМЕНТЫ ДЕБАГГИНГА:**
- Performance Dashboard
- Risk Management Dashboard  
- Data Quality Dashboard
- Подробное логирование
- Telegram уведомления

Система готова к полноценной разработке и торговле! 🚀✨
