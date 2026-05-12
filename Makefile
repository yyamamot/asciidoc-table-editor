.PHONY: typecheck lint format build test-unit test-integration test-integration-host check verify package-vsix f5

typecheck:
	pnpm run typecheck

lint:
	pnpm run lint

format:
	pnpm run format

build:
	pnpm run build

test-unit:
	pnpm run test:unit

test-integration:
	pnpm run test:integration

test-integration-host:
	pnpm run test:integration:host

check:
	pnpm run check

verify:
	pnpm run verify

package-vsix:
	pnpm run package:vsix

f5:
	@echo "Open this repository in VS Code and run the 'Run Extension' launch configuration."
