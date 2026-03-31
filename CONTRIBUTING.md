# Contributing to HF-arenas

Thank you for your interest in contributing! Please read this guide before opening issues or pull requests.

## Getting Started

1. Fork the repository and create your branch from `main`.
2. Follow the setup steps in the [README](README.md).
3. Make sure all tests pass before submitting a PR.

## Development Setup

```bash
# Install dependencies
pnpm install

# Build contracts
pnpm contracts:build

# Run contract tests
cd packages/contracts && forge test
```

## Pull Request Guidelines

- **One feature/fix per PR.** Keep changes focused and reviewable.
- **Write tests.** All new contract functions must be covered by Forge tests.
- **No secrets.** Never commit real private keys, API keys, or passwords. Use `.env.example` as a template.
- **Descriptive commit messages.** Use the imperative mood (e.g., "Add registry fee validation test").
- **Pass CI.** All GitHub Actions checks must pass before a PR can be merged.

## Smart Contract Changes

- Target Solidity `0.8.26`.
- Follow the existing NatSpec style for new public/external functions.
- Run `forge test` and `forge build` locally before pushing.
- Any change to fee logic, access control, or fund flows requires additional test coverage.

## Reporting Bugs

Open a GitHub Issue with:
- A clear title and description.
- Steps to reproduce.
- Expected vs. actual behavior.
- Relevant contract addresses or transaction hashes if applicable.

## Security Issues

**Do not open a public issue for security vulnerabilities.** Please email the maintainers directly or use GitHub's private vulnerability reporting feature.

## Code of Conduct

Be respectful, constructive, and professional in all project spaces.
