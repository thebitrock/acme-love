# ACME Love - Rate Limit Management Guide

## Обзор

ACME Love включает комплексную систему управления лимитами Let's Encrypt для предотвращения превышения API ограничений и обеспечения стабильной работы в продакшене.

## Основные лимиты Let's Encrypt

### 1. Общие лимиты запросов (на IP адрес)
- `/acme/new-nonce`: 20 запросов/сек, блокировка на 10 сек
- `/acme/new-order`: 300 запросов/сек, блокировка на 200 сек  
- `/acme/*` (общие): 250 запросов/сек, блокировка на 125 сек

### 2. Лимиты регистрации аккаунтов
- Новые регистрации на IP: 10 за 3 часа

### 3. Лимиты выпуска сертификатов
- Новые заказы на аккаунт: 300 за 3 часа
- Ошибки авторизации: 5 в час на домен
- Дублированные сертификаты: 5 на один набор доменов за 7 дней

## Встроенные решения

### 1. Автоматическое управление лимитами
```typescript
import { NonceManager, RateLimiter } from 'acme-love';

// Создание rate limiter с настройками для продакшена
const rateLimiter = new RateLimiter({
  maxRetries: 5,           // 5 попыток повтора
  baseDelayMs: 2000,       // 2 секунды базовая задержка
  maxDelayMs: 300000,      // 5 минут максимальная задержка
  respectRetryAfter: true  // Уважать заголовки Retry-After
});

// NonceManager с rate limiting
const nonceManager = new NonceManager({
  newNonceUrl: 'https://acme-v02.api.letsencrypt.org/acme/new-nonce',
  fetch: yourFetchFunction,
  rateLimiter,
  prefetchLowWater: 2,     // Минимум 2 nonce в пуле
  prefetchHighWater: 5,    // Максимум 5 nonce в пуле
  maxPool: 10              // Абсолютный максимум пула
});
```

### 2. Обнаружение и обработка rate limits
```typescript
// Rate limiter автоматически обнаруживает:
// - HTTP 503 ответы с заголовком Retry-After
// - Сообщения об ошибках с текстом "rate limit" или "too many"
// - Автоматически повторяет с экспоненциальной задержкой

try {
  const nonce = await nonceManager.take(namespace);
  // Используйте nonce...
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limit: ${error.rateLimitInfo.endpoint}`);
    console.log(`Retry after: ${new Date(error.rateLimitInfo.retryAfter)}`);
  }
}
```

### 3. Debug логирование
```bash
# Включить debug логи для всех компонентов
DEBUG="acme-love:*" node your-app.js

# Только для nonce manager
DEBUG="acme-love:nonce" node your-app.js

# Только для rate limiter
DEBUG="acme-love:ratelimit" node your-app.js
```

## Лучшие практики

### 1. Использование staging среды
```typescript
// Для разработки и тестирования всегда используйте staging
const STAGING_DIRECTORY = 'https://acme-staging-v02.api.letsencrypt.org/directory';

// Staging имеет гораздо более высокие лимиты:
// - 30,000 регистраций на IP за 3 часа (vs 10 в prod)
// - 300,000 новых заказов за 3 часа (vs 300 в prod)
```

### 2. Разнесение доменов
```typescript
// Избегайте дублированных сертификатов, используя разные домены
const domains = [
  ['example1.com', 'www.example1.com'],
  ['example2.com', 'www.example2.com'],
  ['example3.com', 'www.example3.com']
];

// Каждый набор доменов может иметь до 5 сертификатов за 7 дней
```

### 3. Пространственное разнесение запросов
```typescript
// Добавляйте небольшие задержки между неurgent запросами
await delay(500); // 500ms между запросами

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 4. Мониторинг лимитов
```typescript
// Проверка статуса rate limit
const status = rateLimiter.getRateLimitStatus('/acme/new-nonce');
if (status.isLimited) {
  console.log(`Rate limited until: ${new Date(status.retryAfter!)}`);
}

// Очистка rate limit (для тестирования)
rateLimiter.clearRateLimit('/acme/new-nonce');
```

## Конфигурация для разных сред

### Разработка/Тестирование
```typescript
const devRateLimiter = new RateLimiter({
  maxRetries: 2,
  baseDelayMs: 100,    // Быстро для тестов
  maxDelayMs: 5000,    // Короткие таймауты
  respectRetryAfter: true
});
```

### Продакшен
```typescript
const prodRateLimiter = new RateLimiter({
  maxRetries: 5,
  baseDelayMs: 5000,   // Консервативные задержки
  maxDelayMs: 600000,  // 10 минут максимум
  respectRetryAfter: true
});
```

### Высоконагруженные системы
```typescript
const highVolumeRateLimiter = new RateLimiter({
  maxRetries: 3,
  baseDelayMs: 10000,  // Долгие задержки
  maxDelayMs: 1800000, // 30 минут максимум
  respectRetryAfter: true
});
```

## Диагностика проблем

### 1. Включите debug логи
```bash
DEBUG="acme-love:*" npm start
```

### 2. Мониторинг метрик
```typescript
// Размер пула nonces
console.log('Pool size:', nonceManager.getPoolSize(namespace));

// Статус rate limit
const limitStatus = rateLimiter.getRateLimitStatus('/acme/new-nonce');
console.log('Rate limit status:', limitStatus);
```

### 3. Типичные ошибки
- **503 Service Unavailable**: Rate limit, будет автоматически обработан
- **"too many new registrations"**: Слишком много регистраций с IP
- **"too many certificates for domain"**: Превышен лимит на домен
- **"duplicate certificate"**: Дублированный сертификат (5 за 7 дней)

## Примеры использования

### Простое получение nonce
```typescript
const namespace = NonceManager.makeNamespace('https://acme-v02.api.letsencrypt.org');
const nonce = await nonceManager.take(namespace);
```

### Обработка rate limits в цикле
```typescript
for (const domain of domains) {
  try {
    const nonce = await nonceManager.take(namespace);
    // Создать заказ сертификата...
    await delay(1000); // Пауза между запросами
  } catch (error) {
    if (error instanceof RateLimitError) {
      const waitTime = error.rateLimitInfo.retryAfter - Date.now();
      console.log(`Waiting ${waitTime}ms for rate limit...`);
      await delay(waitTime);
      // Повторить итерацию
    }
  }
}
```

### Параллельная обработка с лимитами
```typescript
const semaphore = new Semaphore(3); // Максимум 3 параллельных запроса

const promises = domains.map(async (domain) => {
  await semaphore.acquire();
  try {
    const nonce = await nonceManager.take(namespace);
    // Обработать домен...
  } finally {
    semaphore.release();
  }
});

await Promise.all(promises);
```

## Заключение

Система управления лимитами в ACME Love обеспечивает:
- ✅ Автоматическое обнаружение и обработку rate limits
- ✅ Интеллектуальные повторы с экспоненциальной задержкой  
- ✅ Пулинг nonces для снижения нагрузки на API
- ✅ Подробное debug логирование
- ✅ Конфигурируемые стратегии для разных сред
- ✅ Совместимость с Let's Encrypt production и staging

Библиотека готова к использованию в продакшене для высоконагруженных приложений без риска превышения лимитов API.
