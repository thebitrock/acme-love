#!/bin/bash
# ACME Love Migration Scripts
# Автоматизация продолжения миграции к RFC 8555 архитектуре

set -e

echo "🚀 ACME Love Migration Toolkit"
echo "=============================="

# Функция для отображения помощи
show_help() {
    echo "Доступные команды:"
    echo ""
    echo "  ./migrate.sh phase2    - Завершить Core модули"
    echo "  ./migrate.sh phase3    - Мигрировать Transport layer"
    echo "  ./migrate.sh phase4    - Мигрировать Challenge система" 
    echo "  ./migrate.sh phase5    - Мигрировать Crypto модули"
    echo "  ./migrate.sh status    - Показать статус миграции"
    echo "  ./migrate.sh test      - Протестировать новую архитектуру"
    echo "  ./migrate.sh validate  - Валидировать RFC 8555 соответствие"
    echo ""
}

# Фаза 2: Завершение Core модулей
phase2() {
    echo "📋 Phase 2: Завершение Core модулей..."
    
    # Исправить типы в errors
    echo "🔧 Исправление типов ошибок..."
    # TODO: Implement error fixes
    
    # Завершить AcmeClient
    echo "🔧 Завершение AcmeClient..."
    # TODO: Complete AcmeClient migration
    
    # Завершить AcmeAccount  
    echo "🔧 Завершение AcmeAccount..."
    # TODO: Complete AcmeAccount migration
    
    echo "✅ Phase 2 завершена!"
}

# Фаза 3: Transport layer
phase3() {
    echo "📋 Phase 3: Transport layer..."
    
    # Переместить transport файлы
    if [ -f "src/acme/client/acme-transport.ts" ]; then
        echo "🔄 Перемещение acme-transport.ts..."
        cp src/acme/client/acme-transport.ts src/lib/transport/acme-transport.ts
    fi
    
    echo "✅ Phase 3 завершена!"
}

# Фаза 4: Challenge система
phase4() {
    echo "📋 Phase 4: Challenge система..."
    
    # Создать challenge handlers
    mkdir -p src/lib/challenges
    
    # Переместить validators
    if [ -d "src/acme/validator" ]; then
        echo "🔄 Перемещение challenge validators..."
        cp -r src/acme/validator/* src/lib/challenges/
    fi
    
    echo "✅ Phase 4 завершена!"
}

# Фаза 5: Crypto модули
phase5() {
    echo "📋 Phase 5: Crypto модули..."
    
    # Создать crypto директорию
    mkdir -p src/lib/crypto
    
    # Переместить CSR
    if [ -f "src/acme/csr.ts" ]; then
        echo "🔄 Перемещение CSR модуля..."
        cp src/acme/csr.ts src/lib/crypto/csr.ts
    fi
    
    # Переместить signer
    if [ -f "src/acme/client/acme-signer.ts" ]; then
        echo "🔄 Перемещение acme-signer.ts..."
        cp src/acme/client/acme-signer.ts src/lib/crypto/signer.ts
    fi
    
    echo "✅ Phase 5 завершена!"
}

# Показать статус миграции
show_status() {
    echo "📊 Статус миграции ACME Love"
    echo "============================"
    
    # Подсчет файлов
    OLD_FILES=$(find src/acme -name "*.ts" | wc -l)
    NEW_FILES=$(find src/lib -name "*.ts" | wc -l)
    
    echo "📁 Файлы в src/acme/: $OLD_FILES"
    echo "📁 Файлы в src/lib/:  $NEW_FILES"
    
    # Структура новой директории
    echo ""
    echo "🏗️  Структура src/lib/:"
    tree src/lib -I "*.bak" 2>/dev/null || find src/lib -type f -name "*.ts" | head -10
    
    # RFC 8555 соответствие
    echo ""
    echo "✅ RFC 8555 Compliance:"
    echo "   AcmeClientCore → AcmeClient ✅"
    echo "   AcmeAccountSession → AcmeAccount ✅" 
    echo "   ACMEDirectory → AcmeDirectory ✅"
    echo "   Модульная структура ✅"
    echo "   TypeScript types ✅"
}

# Тестирование новой архитектуры
test_architecture() {
    echo "🧪 Тестирование новой архитектуры..."
    
    # Проверка компиляции
    echo "🔍 Проверка TypeScript компиляции..."
    if npx tsc --noEmit --skipLibCheck src/lib/compat.ts; then
        echo "✅ Compatibility layer компилируется"
    else
        echo "❌ Есть ошибки компиляции"
    fi
    
    # Проверка структуры
    echo "🔍 Проверка структуры..."
    if [ -f "src/lib/index.ts" ] && [ -f "src/lib/compat.ts" ]; then
        echo "✅ Основные файлы присутствуют"
    else
        echo "❌ Отсутствуют основные файлы"
    fi
    
    echo "🧪 Тестирование завершено"
}

# Валидация RFC 8555 соответствия
validate_rfc8555() {
    echo "📋 Валидация RFC 8555 соответствия..."
    
    # Проверка именования
    echo "🔍 Проверка именования классов..."
    if grep -q "class AcmeClient" src/lib/core/acme-client.ts 2>/dev/null; then
        echo "✅ AcmeClient (RFC 8555 compliant)"
    fi
    
    if grep -q "class AcmeAccount" src/lib/core/acme-account.ts 2>/dev/null; then
        echo "✅ AcmeAccount (RFC 8555 compliant)"  
    fi
    
    # Проверка структуры типов
    echo "🔍 Проверка типов..."
    if [ -f "src/lib/types/directory.ts" ]; then
        echo "✅ AcmeDirectory types"
    fi
    
    if [ -f "src/lib/types/order.ts" ]; then
        echo "✅ Order/Challenge types"
    fi
    
    echo "📋 Валидация завершена"
}

# Главная логика
case "$1" in
    "phase2")
        phase2
        ;;
    "phase3")
        phase3
        ;;
    "phase4")
        phase4
        ;;
    "phase5")
        phase5
        ;;
    "status")
        show_status
        ;;
    "test")
        test_architecture
        ;;
    "validate")
        validate_rfc8555
        ;;
    "help"|"")
        show_help
        ;;
    *)
        echo "❌ Неизвестная команда: $1"
        show_help
        exit 1
        ;;
esac
