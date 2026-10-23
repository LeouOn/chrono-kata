# Coach personalities

Five system prompts: zen, hype, analyst, buddy, athena.

## Athena setup

`athena-persona.ts` is **gitignored**. The placeholder version `athena-persona.ts.example` is checked in.

To set up the real Athena persona:
1. Open `athena-persona.ts` (created automatically from `athena-persona.ts.example` by
   `npm install` and the `pre*` npm hooks)
2. Replace the placeholder string with the full persona prompt
3. Save. The file will not be committed.

If the file is missing, `npm install` recreates the placeholder; `scripts/ensure-athena-persona.mjs`
never overwrites a persona you already wrote.
