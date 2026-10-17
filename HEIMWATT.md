# heimWatt-Fork von Documenso

Dieses Repository ist der Fork `rubensyv/documenso` von `documenso/documenso`.
heimWatt nutzt ihn ausschließlich als eingebettete Signatur (Embed) in einer
eigenen Anwendung.

Betrieb, Deploy, Preview-Tests und Notfall-Rollback sind im privaten
Betriebsrepo von heimWatt dokumentiert, nicht hier.

Diese Seite ist das **Register aller Abweichungen vom Upstream**. Wer den
Fork aktualisiert oder etwas ändert, pflegt sie mit — sie ist die Stelle, die
man in sechs Monaten zuerst aufschlägt.

## Leitlinien (wartungsarm)

1. **Isolieren statt einflechten.** Eigener Code liegt in `heimwatt/`-Ordnern
   (`apps/remix/app/components/embed/heimwatt/`, `packages/lib/heimwatt/`).
   In Upstream-Dateien gibt es nur kleine, mit `// heimWatt:` markierte
   Stellen — `git grep "heimWatt"` findet sie alle.
2. **Schalter statt Rebuild.** Features hängen an `NEXT_PUBLIC_*`-Env-Variablen,
   die Documenso zur Laufzeit liest (`window.__ENV__`). Umschalten = Env-Variable
   des Dienstes ändern (verwaltet im Betriebsrepo), kein Image-Build. Default aus = exakt Upstream-Verhalten.
3. **Upstream-Dateien nur additiv anfassen** (optionale Props, ein Block),
   damit `git merge` beim nächsten Release höchstens an bekannten Stellen
   stolpert.
4. **Übersetzungen** nur für `de` pflegen (`packages/lib/translations/de/web.po`,
   dazu der `en`-Quelleintrag). Andere Sprachen fallen auf Englisch zurück.
   Kein komplettes `lingui extract` committen — die Upstream-Kataloge sind
   gegenüber dem Quellcode veraltet, ein Voll-Extract erzeugt tausende
   Diff-Zeilen. Neue Einträge von Hand an der sortierten Stelle eintragen
   (Sortierung: `Intl.Collator("en-US")` auf msgid, dann msgctxt); der
   Docker-Build extrahiert und kompiliert ohnehin selbst (`apps/remix/.bin/build.sh`).

## Abweichungen vom Upstream

| Bereich | Dateien | Zweck | Prüfen nach Upstream-Merge |
|---|---|---|---|
| Deploy | `.github/workflows/deploy-documenso.yml` | Push auf `main` → Image-Build → Cloud Run (Prod, kein Staging). `workflow_dispatch` mit Haken **preview** → Revision ohne Traffic unter Tag `preview`. Ziel und Konten kommen aus Repo-Secrets. | Läuft der Workflow noch durch? (`docker/Dockerfile`-Pfad, Build-Skript) |
| Geführte Mobile-Signatur | `apps/remix/app/components/embed/heimwatt/guided-signing-bar.tsx`, `packages/lib/heimwatt/guided-signing.ts` (+ `.test.ts`) | Unter `md` ersetzt eine Leiste mit drei Schritten (Unterschrift zeichnen → Feld x von n antippen → Abschließen) das aufklappbare Documenso-Widget; Auto-Scroll zum nächsten Feld. Desktop unverändert. | Embed auf dem Handy öffnen: Leiste sichtbar, drei Schritte durchlaufbar |
| ↳ Einhängepunkt | `apps/remix/app/components/embed/embed-document-signing-page-v1.tsx` (Block `// heimWatt:`) | Rendert die Leiste, blendet das Widget unter `md` aus, wenn sie aktiv ist. | Merge-Konflikt hier möglich; Block nach dem Merge sinngemäß wieder einsetzen |
| ↳ Signatur-Dialog | `packages/ui/primitives/signature-pad/signature-pad-dialog.tsx` (Props `open`/`onOpenChange`/`hideTrigger`) | Leiste öffnet das Pad von ihrem eigenen Knopf aus. Ohne die Props = Upstream-Verhalten. | Props noch vorhanden? Dialog-Block wurde in `const dialog` ausgelagert |
| ↳ Übersetzungen | `packages/lib/translations/{de,en}/web.po` | Deutsche Texte der Leiste (9 Einträge, Quelle `guided-signing-bar.tsx`). | `npm run translate:compile` ohne Fehler; deutsche Texte im Embed sichtbar |
| pdf.js-Legacy-Build | `apps/remix/app/components/general/pdf-viewer/pdf-viewer.tsx` (Importe, `// heimWatt:`) | Der Standard-Build von `pdfjs-dist` setzt neue JS-APIs ohne Polyfill voraus (u. a. `ArrayBuffer.transferToFixedLength`, `Math.sumPrecise` → Firefox 137+). Auf Firefox 115 ESR (macOS 10.12–10.14, Windows 7/8) fehlten dadurch alle Texte, Seiten hingen, Unterschriftsfelder erschienen nie. Der Legacy-Build bringt die Polyfills mit. | Nach `pdfjs-dist`-Update: Importe zeigen noch auf `pdfjs-dist/legacy/build/`; Firefox 115 ESR zeigt Text |
| Renderfehler-Signal | `packages/lib/heimwatt/render-failure.ts` (+ `.test.ts`), `apps/remix/app/components/embed/heimwatt/render-canary.ts`, `render-canary-pdf.ts`; Einhängepunkte in `pdf-viewer.tsx` (`// heimWatt:`) | Im Embed meldet der Viewer der Host-Seite per `postMessage`, wenn der Kunde Seiten ohne Inhalt sieht (siehe unten). Die Host-Seite zeigt dann Hinweis und Ausweg. | `(cd packages/lib && npx vitest run heimwatt)`; alle `heimWatt`-Blöcke in `pdf-viewer.tsx` noch vorhanden |

### Embed-Event `document-render-failed`

Nur im Embed (`window.parent !== window`), zusätzlich zu Documensos Events:

```ts
{ action: 'document-render-failed', data: { reason, pageNumber?: number } }
```

| `reason` | Auslöser |
|---|---|
| `document-load-failed` | PDF nicht ladbar oder nicht lesbar |
| `page-render-failed` | pdf.js lehnt das Rendern einer Seite ab |
| `page-render-timeout` | Seite nach `PAGE_RENDER_TIMEOUT_MS` (20 s) nicht fertig; gemessen 39–59 ms je Seite in Firefox 115 |
| `render-capability-failed` | Prüf-PDF mit eingebetteter Schrift ergibt keine sichtbaren Glyphen (pdf.js verwirft Schriften still; `stopAtErrors` erkennt das nicht, gemessen) |

Kompatibel in beide Richtungen: Ältere Hosts ignorieren die unbekannte Action (ihr `switch` hat keinen Default), ältere Fork-Stände senden sie nie.

### Env-Schalter

| Variable | Wirkung | Gesetzt in |
|---|---|---|
| `NEXT_PUBLIC_HEIMWATT_GUIDED_SIGNING` | `"true"` → geführte Mobile-Signatur an; alles andere → Upstream-Widget | Dienst-Konfiguration im Betriebsrepo |

Ebenfalls nur per Datenbank gesetzt (kein Code): `OrganisationClaim.flags.hidePoweredBy = true`
und `embedSigningWhiteLabel`.

## Upstream-Release einspielen

```bash
git fetch upstream --tags
git switch -c chore/sync-vX.Y.Z origin/main
git merge vX.Y.Z            # Konflikte erwartet in: embed-document-signing-page-v1.tsx,
                            # signature-pad-dialog.tsx, ggf. web.po (de/en)
npm ci && (cd packages/prisma && npx prisma generate)
(cd packages/lib && npx vitest run heimwatt)          # Schritt-Logik
(cd apps/remix && npm run typecheck)
npm run translate:compile                              # Kataloge kompilieren (nicht extract committen)
```

Danach die Spalte „Prüfen nach Upstream-Merge" der Tabelle abarbeiten, PR öffnen,
per `workflow_dispatch` + **preview** eine Revision ohne Traffic bauen und mit
einem echten Embed-Link prüfen (Ablauf und Fallstricke im Betriebsrepo).
Erst dann mergen.

## Preview-Deploy

Actions → „Deploy Documenso" → *Run workflow* → Branch wählen → Haken **preview**.
Ergebnis: Revision ohne Traffic unter dem Tag `preview`; Prod bleibt unberührt,
der nächste Push auf `main` gibt den Stand frei. Wie man die Preview testet und
was man dabei nicht tun darf, steht im Betriebsrepo.
