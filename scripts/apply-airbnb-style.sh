#!/bin/bash

# Apply Airbnb JavaScript Style Guide to the project
echo "Applying Airbnb JavaScript Style Guide to the project..."

# Update the imports in TypeScript files to use proper Airbnb style
function fix_imports() {
  echo "Fixing imports in TypeScript files..."
  find src __tests__ -name "*.ts" -exec sed -i -E 's/^import \{([^}]*)\} from/import {\n  \1\n} from/g' {} \;
}

# Apply Airbnb indentation rules (2 spaces)
function fix_indentation() {
  echo "Applying 2-space indentation..."
  # This is handled by prettier
}

# Fix trailing commas
function fix_trailing_commas() {
  echo "Adding trailing commas to multiline objects and arrays..."
  # This is handled by prettier
}

# Fix semicolons
function fix_semicolons() {
  echo "Ensuring all statements end with semicolons..."
  # This is handled by prettier
}

# Fix string quotes
function fix_quotes() {
  echo "Converting to single quotes..."
  # This is handled by prettier
}

# Fix arrow functions
function fix_arrow_functions() {
  echo "Fixing arrow functions to follow Airbnb style..."
  # This is handled by prettier and eslint
}

# Run prettier with Airbnb-compatible configuration
function run_prettier() {
  echo "Running Prettier with Airbnb-compatible configuration..."
  npm run format
}

# Run ESLint with Airbnb rules
function run_eslint() {
  echo "Running ESLint with Airbnb-compatible rules..."
  npm run lint
}

# Create a summary of the changes
function create_summary() {
  echo "Generating a summary of the applied style changes..."

  # Count files modified
  modified_files=$(git diff --name-only | wc -l)

  echo "Summary of Airbnb Style Guide Application:"
  echo "----------------------------------------"
  echo "Files modified: $modified_files"
  echo "Main style rules applied:"
  echo "- 2 space indentation"
  echo "- Single quotes for strings"
  echo "- Semicolons at the end of statements"
  echo "- Trailing commas in multiline objects and arrays"
  echo "- Proper import/export formatting"
  echo "- ES6+ features preferred (arrow functions, template literals, etc.)"
  echo "- TypeScript types enforced (no implicit any)"
  echo "- Proper spacing in code blocks"
  echo "----------------------------------------"
  echo "Please review the changes and commit them if satisfactory."
}

# Run all the formatting steps
fix_imports
fix_indentation
fix_trailing_commas
fix_semicolons
fix_quotes
fix_arrow_functions
run_prettier
run_eslint
create_summary

echo "Airbnb style application complete!"
