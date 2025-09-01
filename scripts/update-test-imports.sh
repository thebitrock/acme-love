#!/bin/bash

# Скрипт для обновления импортов в тестах на новую архитектуру

echo "🔄 Обновляем импорты в тестах для новой архитектуры..."

# Функция для замены импортов
update_imports() {
    local file="$1"
    echo "   Обновляем: $file"
    
    # Основные компоненты
    sed -i 's|from '\''../src/acme/client/acme-client-core.js'\''|from '\''../src/lib/core/acme-client.js'\''|g' "$file"
    sed -i 's|from '\''../src/acme/client/nonce-manager.js'\''|from '\''../src/lib/managers/nonce-manager.js'\''|g' "$file"
    sed -i 's|from '\''../src/acme/client/rate-limiter.js'\''|from '\''../src/lib/managers/rate-limiter.js'\''|g' "$file"
    sed -i 's|from '\''../src/acme/http/http-client.js'\''|from '\''../src/lib/transport/http-client.js'\''|g' "$file"
    sed -i 's|from '\''../src/acme/csr.js'\''|from '\''../src/lib/crypto/csr.js'\''|g' "$file"
    
    # Классы
    sed -i 's|AcmeClientCore|AcmeClient|g' "$file"
    
    # Типы CSR
    sed -i 's|type CsrAlgo|type AcmeCertificateAlgorithm|g' "$file"
    sed -i 's|type EcAlgo|type AcmeEcAlgorithm|g' "$file"
    sed -i 's|type RsaAlgo|type AcmeRsaAlgorithm|g' "$file"
    sed -i 's|: CsrAlgo|: AcmeCertificateAlgorithm|g' "$file"
    sed -i 's|: EcAlgo|: AcmeEcAlgorithm|g' "$file"
    sed -i 's|: RsaAlgo|: AcmeRsaAlgorithm|g' "$file"
    
    # Array типы
    sed -i 's|Array<EcAlgo\['\''namedCurve'\''\]>|Array<AcmeEcAlgorithm['\''namedCurve'\'']>|g' "$file"
    sed -i 's|Array<RsaAlgo\['\''modulusLength'\''\]>|Array<AcmeRsaAlgorithm['\''modulusLength'\'']>|g' "$file"
}

# Обновляем CSR тест
update_imports "__tests__/csr.test.ts"

# Обновляем остальные тесты с простыми заменами
for test_file in __tests__/*.test.ts; do
    if [[ "$test_file" != "__tests__/csr.test.ts" ]]; then
        update_imports "$test_file"
    fi
done

echo "✅ Импорты в тестах обновлены!"
echo ""
echo "⚠️  Примечание: Некоторые тесты могут требовать дополнительных изменений"
echo "   из-за изменений API между старой и новой архитектурой."
