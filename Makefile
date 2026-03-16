PORT ?= 8080

.PHONY: setup preview lint dupes

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
