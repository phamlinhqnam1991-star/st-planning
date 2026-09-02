# ST Planning · UI Language Architecture (EN / VI)

## Source of truth

ST Planning uses **one application, one business logic layer, one API layer and one database model**. Language changes only UI copy.

- Supported UI languages: **EN / VI**
- Default language for a new browser: **EN**
- User selection is persisted locally in `st_ui_language` and cookie `st_ui_lang`.
- The current language switch is available in both ERP header implementations.
- No `/en`, `/vi`, duplicate page, duplicate API or duplicate business logic is created.

## Never translate business data

The i18n layer must not change values coming from the database or business identifiers such as:

- Job / Part / Batch numbers
- Recipe names and recipe keys
- Operation Code / Main Operation values
- READY / WAIT / DONE / PLANNED / SCHEDULED state codes
- Resource codes, Schedule Area codes, ST Group codes
- imported Excel values

Those values stay exactly as stored. Only surrounding UI labels, instructions, buttons, headings, placeholders, tooltips and user messages are localized.

## Files

- `src/lib/i18n/ui-catalog.json` — centralized EN/VI catalog.
- `src/lib/i18n/ui-language.ts` — translation engine and explicit `uiPair()` API.
- `src/components/i18n/ui-language-provider.tsx` — global language state + legacy UI presentation adapter.
- `src/components/i18n/language-switch.tsx` — EN / VI switch.
- `src/components/i18n/ui-text.tsx` — explicit bilingual text component.
- `scripts/check-ui-i18n.mjs` — validates the bilingual contract.

## Rule for every future UI change

Whenever UI text is added or edited, **EN and VI must be changed together in the same change**.

Preferred for new client-side UI:

```tsx
const {text}=useUiLanguage();
<button>{text("Save", "Lưu")}</button>
```

or:

```tsx
<UiText en="Save" vi="Lưu" />
```

For shared/static legacy UI, add the pair to `ui-catalog.json`.

Do not create language-specific copies of a component or page.

## Validation

Run:

```bash
npm run i18n:check
npm run build
```

`i18n:check` protects the default EN setting, the EN/VI locale set, required navigation translations and conflicting exact translations.
