#!/bin/bash

# Fix TypeScript code according to Airbnb style guide

# Function to check if a file exists
file_exists() {
  [ -f "$1" ]
}

# Apply fixes
echo "Applying standard fixes..."

# 1. Update imports to have proper sorting and spacing
echo "Fixing import order and spacing..."
find src __tests__ -name "*.ts" -not -path "*/node_modules/*" -exec sed -i -E 's/^import \{([^}]*)\} from/import {\n  \1\n} from/g' {} \;

# 2. Replace 'any' type with more specific types
echo "Adding type interfaces for common patterns..."

# Create a types.ts file if it doesn't exist
if ! file_exists src/types.ts; then
  echo "Creating src/types.ts file..."
  cat > src/types.ts << 'EOL'
/**
 * Common types used throughout the application
 */

export type JsonObject = Record<string, unknown>;
export type JsonArray = unknown[];
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

export type HttpResponse<T = JsonValue> = {
  status: number;
  data: T;
  headers?: Record<string, string>;
};

export type ErrorResponse = {
  type: string;
  detail: string;
  status?: number;
  instance?: string;
  subproblems?: ErrorResponse[];
};
EOL
fi

# Run prettier and eslint
echo "Running formatter..."
npm run format

echo "Running linter..."
npm run lint

echo "Code improvements complete. Please review the changes and address any remaining linting issues."
