PORT ?= 8080

.PHONY: setup preview
setup:
	git config core.hooksPath .githooks
	chmod +x .githooks/pre-commit
	@echo "→ pre-commit hook installed"

preview:
	@echo "→ http://localhost:$(PORT)"
	@open "http://localhost:$(PORT)" 2>/dev/null || xdg-open "http://localhost:$(PORT)" 2>/dev/null || true
	python3 -m http.server $(PORT)
