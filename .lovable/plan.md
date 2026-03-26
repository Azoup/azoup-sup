

## Plan: Corrections and Improvements

### Issues Identified

1. **Dashboard Dúvidas query bug**: `Dashboard.tsx` fetches ALL `doubt_records` without filtering `business_unit_id IS NULL`, so BU records contaminate the analyst dashboard.
2. **Entries save error**: The insert looks structurally correct, but adding better error logging and validation will help. The `onError` callback swallows the actual error message.
3. **Excel import still present** in `Entries.tsx` (lines 112-187 logic, lines 221-254 UI).
4. **EntriesBU** lacks a month filter.

---

### Changes

#### 1. `src/pages/Entries.tsx` — Remove Excel import, fix save
- Remove all import-related state (`importRows`, `showImportConfirm`), `handleFileUpload`, `importMutation`, the Excel Import card UI, and the AlertDialog.
- Remove `xlsx` import and unused icons (`Upload`, `FileSpreadsheet`).
- Fix `onError` to show the actual error message: `toast.error('Erro: ' + (err as any).message)`.
- Add validation guard in `createMutation`: check `analystId` is set, `doubts` is a valid number.

#### 2. `src/pages/Dashboard.tsx` — Filter only analyst records
- Add `.is('business_unit_id', null)` to the query on line 36 so BU records are excluded.

#### 3. `src/pages/EntriesBU.tsx` — Add month filter
- Add a `monthFilter` state and a month `<Select>` dropdown (last 12 months).
- When a month is selected, filter the records list to show only entries within that month (client-side filtering on top of existing week logic, or adjust query range).

#### 4. Minor fixes
- Add `DialogDescription` to edit dialogs to fix the console warning about missing `Description`.

### Files Modified
- `src/pages/Entries.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/EntriesBU.tsx`

