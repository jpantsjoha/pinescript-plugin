.PHONY: gate spec skills links examples mcp hooks help

PYTHON  := python3
SCRIPTS := scripts

# ─── Pre-commit gate. Install once with: make hooks ──────────────────────────
gate: spec skills links examples mcp
	@echo ""
	@echo "Gate passed: spec + skills + links + examples + mcp"

spec:
	@echo "==> Agent Plugins 1.0.0 conformance..."
	@$(PYTHON) $(SCRIPTS)/validate_agent_plugins.py

skills:
	@echo "==> SKILL.md contracts..."
	@$(PYTHON) $(SCRIPTS)/validate_skills.py

links:
	@echo "==> Reference URLs..."
	@$(PYTHON) $(SCRIPTS)/check_links.py

# Every Pine snippet inside a skill is extracted and validated. A skill that ships
# Pine failing its own checker is worse than no skill at all.
examples:
	@echo "==> Validating Pine examples embedded in skills..."
	@$(PYTHON) $(SCRIPTS)/validate_skill_examples.py

mcp:
	@echo "==> MCP server behaviour tests..."
	@node --test tests/*.test.js

hooks:
	@git config core.hooksPath .githooks
	@echo "Pre-commit hook installed (runs 'make gate')."

help:
	@echo "gate   - run every check (pre-commit gate)"
	@echo "spec   - Agent Plugins 1.0.0 conformance"
	@echo "skills - SKILL.md frontmatter contracts"
	@echo "links  - reference URLs resolve"
	@echo "examples - Pine examples inside skills actually validate"
	@echo "mcp      - MCP server behaviour tests"
	@echo "hooks  - install the pre-commit hook"
