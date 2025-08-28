#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check git status
check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        error "You have uncommitted changes!"
        git status --short
        echo
        read -p "Continue? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            exit 1
        fi
    fi
}

# Function to check current branch
check_branch() {
    current_branch=$(git branch --show-current)
    if [[ "$current_branch" != "main" ]] && [[ "$current_branch" != "master" ]]; then
        warning "You are on branch '$current_branch', not main/master"
        read -p "Continue? (y/N): " confirm
        if [[ $confirm != [yY] ]]; then
            exit 1
        fi
    fi
}

# Function to check npm authentication
check_npm_auth() {
    if ! npm whoami > /dev/null 2>&1; then
        error "You are not authenticated with npm!"
        echo "Run: npm login"
        exit 1
    fi
    log "Authenticated as: $(npm whoami)"
}

# Function to run tests and checks
run_tests_and_checks() {
    log "Running code formatting check..."
    if ! npm run format:check; then
        error "Code formatting check failed! Run 'npm run format' to fix."
        exit 1
    fi
    success "Code formatting is correct"
    
    log "Running linting check..."
    if ! npm run lint:check; then
        error "Linting check failed! Run 'npm run lint' to fix."
        exit 1
    fi
    success "Linting passed"
    
    log "Running tests..."
    if ! npm test; then
        error "Tests failed!"
        exit 1
    fi
    success "All tests passed"
}

# Function to build project
build_project() {
    log "Building project for production..."
    if ! npm run clean; then
        error "Clean failed"
        exit 1
    fi
    
    if ! npm run build:prod; then
        error "Build failed"
        exit 1
    fi
    success "Build completed successfully"
}

# Function to show package size
show_package_size() {
    log "Package size:"
    npm pack --dry-run | tail -10
}

# Function to update version
update_version() {
    local version_type=$1
    log "Updating version ($version_type)..."
    
    if ! npm version $version_type; then
        error "Version update failed"
        exit 1
    fi
    
    new_version=$(node -p "require('./package.json').version")
    success "Version updated to: $new_version"
}

# Function to publish package
publish_package() {
    local tag=$1
    log "Publishing package..."
    
    if [[ -n "$tag" ]]; then
        if ! npm publish --tag $tag; then
            error "Publish failed"
            exit 1
        fi
        success "Package published with tag '$tag'"
    else
        if ! npm publish; then
            error "Publish failed"
            exit 1
        fi
        success "Package published successfully"
    fi
}

# Function to push to git
git_push() {
    log "Pushing changes to git..."
    if ! git push && git push --tags; then
        error "Git push failed"
        exit 1
    fi
    success "Changes pushed to git"
}

# Main function
main() {
    echo "🚀 Automated ACME Love package publishing"
    echo "========================================"
    
    # Check parameters
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <patch|minor|major|beta|alpha|dry>"
        echo ""
        echo "Options:"
        echo "  patch  - Patch version (1.0.0 -> 1.0.1)"
        echo "  minor  - Minor version (1.0.0 -> 1.1.0)"
        echo "  major  - Major version (1.0.0 -> 2.0.0)"
        echo "  beta   - Beta version (1.0.0 -> 1.0.1-beta.0)"
        echo "  alpha  - Alpha version (1.0.0 -> 1.0.1-alpha.0)"
        echo "  dry    - Dry run only (no publishing)"
        exit 1
    fi
    
    local publish_type=$1
    
    # Dry run
    if [[ "$publish_type" == "dry" ]]; then
        log "Dry run mode"
        check_git_status
        run_tests_and_checks
        build_project
        show_package_size
        success "Dry run completed successfully"
        exit 0
    fi
    
    # Checks
    check_npm_auth
    check_git_status
    check_branch
    
    # Tests and build
    run_tests_and_checks
    build_project
    show_package_size
    
    # Confirmation
    echo ""
    current_version=$(node -p "require('./package.json').version")
    log "Current version: $current_version"
    read -p "Continue with publishing ($publish_type)? (y/N): " confirm
    if [[ $confirm != [yY] ]]; then
        log "Publishing cancelled"
        exit 0
    fi
    
    # Version update and publishing
    case $publish_type in
        patch|minor|major)
            update_version $publish_type
            publish_package
            git_push
            ;;
        beta)
            update_version "prerelease --preid=beta"
            publish_package "beta"
            git_push
            ;;
        alpha)
            update_version "prerelease --preid=alpha"
            publish_package "alpha"
            git_push
            ;;
        *)
            error "Unknown publish type: $publish_type"
            exit 1
            ;;
    esac
    
    new_version=$(node -p "require('./package.json').version")
    echo ""
    success "🎉 Package acme-love@$new_version published successfully!"
    echo "📦 https://www.npmjs.com/package/acme-love"
}

# Run
main "$@"
