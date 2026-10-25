# Contributing to Sanchay

Thanks for helping. Bug reports, fixes, new statement formats and better wording are all welcome.

## Keep personal data out

Sanchay handles bank statements, salaries and portfolios, so please be careful with what you share:

- Never attach a real statement, payslip or CAS file to an issue or pull request, and never commit one.
- When a statement doesn't import correctly, describe the layout (column names, date format, how debits and credits are shown) or make a copy with the names, account numbers and amounts replaced.
- Test fixtures must be synthetic. `npm run fixture` regenerates the sample CSVs in `fixtures/`, and `src/shared/sampleData.ts` builds made-up statements you can extend.
- Screenshots should use the sample data, not your own. To keep your real data untouched, run a separate copy with its own data folder, then choose "Use sample data" during setup:

  ```bash
  SANCHAY_DATA_DIR=/tmp/sanchay-demo npm run dev
  ```

## Setting up

You need macOS, Node.js 22 or later and npm.

```bash
git clone https://github.com/ashwinsingh2007/sanchay.git
cd sanchay
npm install
npm run dev
```

The README covers the architecture and the scripts. Design rules for colours, themes and type are in [DESIGN.md](DESIGN.md).

## Before you open a pull request

Run the same checks as CI:

```bash
npm run typecheck && npm run lint && npm test && npm run format:check
```

Then:

- Keep each pull request to one change. Small ones get reviewed faster.
- Add or update unit tests when you change anything in `src/shared/domain`. Money logic needs a test for each rule you add.
- Store money as integer paise (see `src/shared/money.ts`). Never use floating-point maths for amounts.
- If you change the database schema, edit `src/main/db/schema.ts` and run `npm run db:generate` to create the migration.
- If your change sends any new data off the device, say so in the pull request and update the privacy table in the README.
- Describe what you changed and how you tested it. A screenshot helps for UI changes.

For a large change, such as a new data source or a new page, open an issue first so we can agree on the approach before you spend time on it.

## Commit messages

Write the subject in the imperative ("Add Kotak credit card parser", not "Added..."), keep it under about 70 characters, and use the body to explain why.

## Licence

Sanchay is licensed under the [MIT License](LICENSE). By opening a pull request you agree that your contribution is released under the same licence. There is no contributor licence agreement to sign.

## Code of conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
