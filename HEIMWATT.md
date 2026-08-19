# heimWatt-Fork von Documenso

Dieses Repository ist der Fork `rubensyv/documenso` von `documenso/documenso`.
Er läuft als Cloud-Run-Dienst `documenso` (Projekt `heimwatt-app-ffe6c`,
`europe-west3`, Domain `esign.heim-watt.de`) und wird ausschließlich als
Embed im Beratungsprotokoll (Repo `esign`, Lib `@heimwatt/document-signing`)
benutzt.

Diese Seite ist das **Register aller Abweichungen vom Upstream**. Wer den
Fork aktualisiert oder etwas ändert, pflegt sie mit — sie ist die Stelle, die
man in sechs Monaten zuerst aufschlägt.

## Leitlinien (wartungsarm)

1. **Isolieren statt einflechten.** Eigener Code liegt in `heimwatt/`-Ordnern
   (`apps/remix/app/components/embed/heimwatt/`, `packages/lib/heimwatt/`).
   In Upstream-Dateien gibt es nur kleine, mit `// heimWatt:` markierte
   Stellen — `git grep "heimWatt"` findet sie alle.
2. **Schalter statt Rebuild.** Features hängen an `NEXT_PUBLIC_*`-Env-Variablen,
   die Documenso zur Laufzeit liest (`window.__ENV__`). Umschalten = Cloud-Run-
   Env ändern (über Terraform, Backend-Repo `infra/terraform/modules/documenso`),
   kein Image-Build. Default aus = exakt Upstream-Verhalten.
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
| Deploy | `.github/workflows/deploy-documenso.yml` | Push auf `main` → Image-Build → Cloud Run (Prod, kein Staging). `workflow_dispatch` mit Haken **preview** → Revision ohne Traffic unter Tag `preview`. | Läuft der Workflow noch durch? (`docker/Dockerfile`-Pfad, Build-Skript) |
| Geführte Mobile-Signatur | `apps/remix/app/components/embed/heimwatt/guided-signing-bar.tsx`, `packages/lib/heimwatt/guided-signing.ts` (+ `.test.ts`) | Unter `md` ersetzt eine Leiste mit drei Schritten (Unterschrift zeichnen → Feld x von n antippen → Abschließen) das aufklappbare Documenso-Widget; Auto-Scroll zum nächsten Feld. Desktop unverändert. | Embed auf dem Handy öffnen: Leiste sichtbar, drei Schritte durchlaufbar |
| ↳ Einhängepunkt | `apps/remix/app/components/embed/embed-document-signing-page-v1.tsx` (Block `// heimWatt:`) | Rendert die Leiste, blendet das Widget unter `md` aus, wenn sie aktiv ist. | Merge-Konflikt hier möglich; Block nach dem Merge sinngemäß wieder einsetzen |
| ↳ Signatur-Dialog | `packages/ui/primitives/signature-pad/signature-pad-dialog.tsx` (Props `open`/`onOpenChange`/`hideTrigger`) | Leiste öffnet das Pad von ihrem eigenen Knopf aus. Ohne die Props = Upstream-Verhalten. | Props noch vorhanden? Dialog-Block wurde in `const dialog` ausgelagert |
| ↳ Übersetzungen | `packages/lib/translations/{de,en}/web.po` | Deutsche Texte der Leiste (9 Einträge, Quelle `guided-signing-bar.tsx`). | `npm run translate:compile` ohne Fehler; deutsche Texte im Embed sichtbar |

### Env-Schalter

| Variable | Wirkung | Gesetzt in |
|---|---|---|
| `NEXT_PUBLIC_HEIMWATT_GUIDED_SIGNING` | `"true"` → geführte Mobile-Signatur an; alles andere → Upstream-Widget | Terraform, Backend-Repo `infra/terraform/modules/documenso/main.tf` (Variable `guided_signing_enabled`) |

Notfall-Rollback ohne Terraform (danach Terraform nachziehen, sonst Drift):

```bash
gcloud run services update documenso --project heimwatt-app-ffe6c --region europe-west3 \
  --update-env-vars NEXT_PUBLIC_HEIMWATT_GUIDED_SIGNING=false
```

Ebenfalls nur per Datenbank gesetzt (kein Code): `OrganisationClaim.flags.hidePoweredBy = true`
und `embedSigningWhiteLabel` (Cloud-Run-Job `documenso-set-claim-flags`).

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
einem echten Embed-Link (Staging-Session des Beratungsprotokolls, Host auf die
Preview-URL getauscht) auf dem Handy prüfen. Erst dann mergen.

## Preview-Deploy

Actions → „Deploy Documenso" → *Run workflow* → Branch wählen → Haken **preview**.
Ergebnis: Revision ohne Traffic, Tag-URL `https://preview---documenso-isexjmthjq-ey.a.run.app`.
Prod bleibt unberührt; der nächste Push auf `main` (oder
`gcloud run services update-traffic documenso --region europe-west3 --to-latest`)
gibt den Stand frei.

Drei Dinge, die man wissen muss:

1. **Die Tag-URL ist im Browser nicht direkt benutzbar.** Die App kennt nur ihre
   Prod-URL (`NEXT_PUBLIC_WEBAPP_URL=https://esign.heim-watt.de`) und schickt
   Session-, tRPC- und PDF-Requests dorthin → CORS-Fehler, das Dokument lädt nie.
   Testen deshalb mit Playwright: Seite unter dem **Prod-Origin** öffnen und alle
   Requests an `https://esign.heim-watt.de/**` per `page.route` auf den Preview-Host
   umschreiben (`route.fetch({ url })` + `route.fulfill({ response })` — nicht
   `route.continue({ url })`, das wertet WebKit als Cross-Origin-Redirect). Beispiel:
   Probe-Spec `_probe-guided.spec.ts` aus der Messreihe vom 19.08.2026 (Session-
   Scratchpad). Kein echter Browser-Test auf dem Handy möglich, ohne die
   Prod-URL-Variablen der Revision zu ändern — und das würde auf Prod durchschlagen (Punkt 2).
2. **Jede Preview-Revision ändert das Service-Template** (Image und alle per
   `--update-env-vars` gesetzten Variablen). Cloud Run baut die nächste Revision
   immer auf dem zuletzt erstellten Template auf — ein späteres `gcloud run deploy`
   *und* ein `terraform apply` (Image steht in `ignore_changes`, Traffic ist dort nicht
   konfiguriert → 100 % auf die neue Revision) rollen damit das Preview-Image aus.
   Reihenfolge also: Preview testen → mergen (normales Deploy mit Traffic) → erst
   danach Terraform anfassen. Niemals Prod-URLs in einer Preview-Revision umbiegen.
3. **Laufzeit-Schalter auf der Preview setzen:** das Workflow-Deploy erbt die Env des
   Templates. Soll ein neues Flag nur auf der Preview an sein, die Revision von Hand
   nachziehen — Image-Tag = kurzer Commit-Hash des Workflow-Laufs:
   ```bash
   gcloud run deploy documenso --project heimwatt-app-ffe6c --region europe-west3 \
     --image europe-west3-docker.pkg.dev/heimwatt-app-ffe6c/heimwatt/documenso:<sha8> \
     --no-traffic --tag preview --update-env-vars NEXT_PUBLIC_HEIMWATT_GUIDED_SIGNING=true
   ```
   Danach muss dasselbe Flag in Terraform stehen (Backend-PR), sonst meldet der
   nächste Plan Drift.
