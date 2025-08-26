# Makefile for acme-love CLI development

.PHONY: help build cli interactive staging production cert clean

help: ## Show this help message
	@echo "🔐 ACME-Love CLI Development"
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the project
	npm run build

cli: build ## Run CLI with help
	./acme-love --help

interactive: build ## Run CLI in interactive mode
	./acme-love interactive

staging: build ## Run CLI in staging mode
	./acme-love interactive --staging

production: build ## Run CLI in production mode
	./acme-love interactive --production

cert: build ## Run cert command
	./acme-love cert --help

clean: ## Clean build artifacts
	npm run clean

install: ## Install dependencies
	npm install
