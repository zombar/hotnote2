PORT ?= 8080

.PHONY: setup preview lint dupes changelog test test-ui test-install test-report

setup:
	npm install
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@echo "→ pre-commit hook installed"

lint:
	node_modules/.bin/eslint js/

dupes:
	node_modules/.bin/jscpd js/
preview:
	@echo "→ http://localhost:$(PORT)"
	@open "http://localhost:$(PORT)" 2>/dev/null || xdg-open "http://localhost:$(PORT)" 2>/dev/null || true
	python3 -m http.server $(PORT)

changelog:
	@bash scripts/gen-changelog.sh

test-install:
	npm install --save-dev @playwright/test
	node_modules/.bin/playwright install chromium

test:
	node_modules/.bin/playwright test

test-ui:
	node_modules/.bin/playwright test --ui

test-report:
	node_modules/.bin/playwright show-report
