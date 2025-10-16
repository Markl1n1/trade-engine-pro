# 🔧 Backtest SL/TP/Trailing Stop Debug Report

## 🐛 **ПРОБЛЕМА**

Пользователь сообщает, что при изменении значений SL/TP/Trailing Stop в конфигурации бэктеста, результаты не меняются.

## 🔍 **АНАЛИЗ ПРОБЛЕМЫ**

### **1. Параметры передаются правильно:**
```typescript
// Frontend (Backtest.tsx)
stopLossPercent: parseFloat(stopLossPercent),
takeProfitPercent: parseFloat(takeProfitPercent),
trailingStopPercent: parseFloat(trailingStopPercent),
```

### **2. Параметры принимаются в Edge Functions:**
```typescript
// run-backtest/index.ts
const { 
  stopLossPercent, 
  takeProfitPercent,
  trailingStopPercent,
  // ...
} = await req.json();
```

### **3. Параметры передаются в Enhanced Backtest Engine:**
```typescript
const backtestConfig = {
  stopLossPercent: stopLossPercent ?? strategy.stop_loss_percent,
  takeProfitPercent: takeProfitPercent ?? strategy.take_profit_percent,
  trailingStopPercent: trailingStopPercent,
  // ...
};
```

## 🔧 **ВНЕСЕННЫЕ ИСПРАВЛЕНИЯ**

### **1. Добавлено логирование параметров:**
```typescript
// run-backtest/index.ts
console.log(`[BACKTEST] Parameters received:`, {
  stopLossPercent,
  takeProfitPercent,
  trailingStopPercent,
  initialBalance,
  productType,
  leverage
});
```

### **2. Добавлено логирование в Enhanced Backtest Engine:**
```typescript
// backtest-engine.ts
console.log(`[BACKTEST] SL/TP/Trailing parameters:`, {
  stopLossPercent: this.config.stopLossPercent,
  takeProfitPercent: this.config.takeProfitPercent,
  trailingStopPercent: this.config.trailingStopPercent
});
```

### **3. Добавлено логирование в TrailingStopManager:**
```typescript
// backtest-engine.ts
constructor(trailingPercent: number) {
  this.trailingPercent = trailingPercent;
  console.log(`[TRAILING] Initialized with ${trailingPercent}% trailing stop`);
}
```

### **4. Добавлено логирование в Simple Backtest:**
```typescript
// run-backtest-simple/index.ts
console.log(`[Simple Backtest] Parameters received:`, {
  stopLossPercent,
  takeProfitPercent,
  trailingStopPercent,
  initialBalance,
  productType,
  leverage
});
```

## 🧪 **ТЕСТИРОВАНИЕ**

### **Для проверки работы SL/TP/Trailing Stop:**

1. **Запустите бэктест с разными значениями:**
   - SL: -45%, TP: 45%, Trailing: 20%
   - SL: -30%, TP: 30%, Trailing: 15%
   - SL: -60%, TP: 60%, Trailing: 25%

2. **Проверьте логи в консоли Supabase:**
   - Должны появиться сообщения о полученных параметрах
   - Должны появиться сообщения о инициализации TrailingStopManager
   - Должны появиться сообщения о срабатывании SL/TP/Trailing Stop

3. **Сравните результаты:**
   - Количество сделок должно отличаться
   - Процент прибыльных сделок должен отличаться
   - Максимальная просадка должна отличаться

## 🔍 **ВОЗМОЖНЫЕ ПРИЧИНЫ ПРОБЛЕМЫ**

### **1. Кэширование результатов:**
- Браузер может кэшировать результаты
- Supabase может кэшировать Edge Functions

### **2. Стратегия не генерирует сигналы:**
- Если стратегия не генерирует входные сигналы, SL/TP не сработают
- Нужно проверить, что стратегия активна и генерирует сигналы

### **3. Параметры перезаписываются:**
- Возможно, параметры из базы данных перезаписывают пользовательские
- Проверьте приоритет параметров в коде

### **4. Логика SL/TP не работает:**
- Возможно, логика проверки SL/TP имеет ошибки
- Нужно проверить условия срабатывания

## 🚀 **РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ**

### **1. Очистите кэш:**
```bash
# В браузере
Ctrl + Shift + R (жесткая перезагрузка)

# Или откройте в режиме инкогнито
```

### **2. Проверьте логи:**
- Откройте Developer Tools → Console
- Запустите бэктест
- Найдите сообщения с параметрами
- Проверьте, что параметры передаются правильно

### **3. Тестируйте с простой стратегией:**
- Создайте простую стратегию с очевидными сигналами
- Используйте короткий период (1-2 дня)
- Проверьте, что стратегия генерирует сигналы

### **4. Проверьте приоритет параметров:**
```typescript
// В коде есть fallback на параметры стратегии
stopLossPercent: stopLossPercent ?? strategy.stop_loss_percent,
takeProfitPercent: takeProfitPercent ?? strategy.take_profit_percent,
```

## 📊 **ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ**

### **После исправления:**
- ✅ Изменение SL должно влиять на количество убыточных сделок
- ✅ Изменение TP должно влиять на количество прибыльных сделок  
- ✅ Изменение Trailing Stop должно влиять на общую прибыльность
- ✅ Логи должны показывать срабатывание SL/TP/Trailing Stop

### **Примеры ожидаемых изменений:**
- **SL -45% → -30%**: Меньше убыточных сделок, больше прибыльных
- **TP 45% → 30%**: Меньше прибыльных сделок, но быстрее закрытие
- **Trailing 20% → 15%**: Более агрессивное закрытие позиций

## 🎯 **СЛЕДУЮЩИЕ ШАГИ**

1. **Запустите тест** с добавленным логированием
2. **Проверьте логи** в консоли Supabase
3. **Сравните результаты** с разными параметрами
4. **Сообщите о результатах** для дальнейшей диагностики

## 🔧 **ДОПОЛНИТЕЛЬНЫЕ ИСПРАВЛЕНИЯ**

Если проблема не решается, можно добавить:

1. **Принудительное обновление кэша**
2. **Дополнительное логирование в критических точках**
3. **Валидацию параметров перед использованием**
4. **Тестовые функции для проверки логики**

---

**Статус**: 🔧 Исправления внесены, требуется тестирование
**Приоритет**: 🔥 Высокий (критическая функциональность)
**Следующий шаг**: Тестирование с добавленным логированием
