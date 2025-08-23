#!/bin/bash

# Format code according to Airbnb style guide
echo "Formatting all code files..."

# Run prettier first
echo "Running Prettier..."
npm run format

# Run ESLint with fixes
echo "Running ESLint with fixes..."
npm run lint

echo "Formatting complete!"
