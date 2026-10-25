# Security policy

Sanchay stores people's financial data, so security reports get priority.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through GitHub: open the [Security tab](https://github.com/ashwinsingh2007/sanchay/security) of this repository and choose "Report a vulnerability". Only the maintainers can see the report.

Include what you found, the steps to reproduce it, and what an attacker could do with it. Don't include anyone's real financial data.

You should get a reply within 7 days. Once the problem is confirmed, we'll work on a fix, agree a disclosure date with you, and credit you in the release notes unless you'd rather stay anonymous.

## What counts

These are in scope:

- Ways for financial data to leave the device other than the ones listed in the README's privacy table
- Personal identifiers (PAN, Aadhaar, account or card numbers and similar) reaching a cloud AI without being masked
- Bypassing the renderer's network lockdown, the sandbox or IPC validation
- A connected data source being able to place trades or change anything despite the read-only block
- Leaks of API keys or sign-in tokens
- Code execution through a crafted statement, PDF or CSV file

These are out of scope:

- Problems that need someone who already has full access to your unlocked Mac
- The SQLite database not being encrypted by the app (the README says so; use FileVault)
- Bugs in third-party services such as INDmoney, brokers or AI providers (please report those to them)

## Supported versions

Sanchay is in early preview. Fixes go into the latest version on `main`.
