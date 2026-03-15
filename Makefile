PORT ?= 8080

.PHONY: preview
preview:
	@echo "→ http://localhost:$(PORT)"
	@open "http://localhost:$(PORT)" 2>/dev/null || xdg-open "http://localhost:$(PORT)" 2>/dev/null || true
	python3 -m http.server $(PORT)
