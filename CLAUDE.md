# NavDock Card – Projektkontext

**Wichtig:** Dieses Dokument ist der Projektkontext – aktuell halten.

Stand: 4. Juli 2026  
Kartenversion: `0.7.3`

## Versionierungs-Policy

- **0.x-Serie:** Aktive Entwicklung. Version 0.7.0 bis alle Tests aus Abschnitt 7 abgeschlossen sind.
- **1.0.0:** Markiert erklärte Stabilität und ein stabiles Feature-Set.
- **Nach 1.0.0:** Strikt semantische Versionierung (SemVer) – Breaking Changes nur in Major-Versionen.

---

## 1. Projektziel

NavDock Card ist eine eigenständige Home-Assistant-Lovelace-Custom-Card. Sie
stellt eine responsive Navigation am unteren Bildschirmrand bereit und soll in
HAOS, der Desktop-App, Browsern und auf Mobilgeräten funktionieren.

Das Design orientiert sich lose an Material You 3 Expressive: klare Flächen,
große Radien, deutliche aktive Zustände und eine einfache visuelle
Konfiguration. NavDock ist eine eigene Implementierung und hat keine
Laufzeitabhängigkeit von `button-card`, `card-mod` oder `navbar-card`.

## 2. Repository-Stand

- GitHub: <https://github.com/smarthomebutbetter/navdock-card>
- Sichtbarkeit: öffentlich
- Remote: `https://github.com/smarthomebutbetter/navdock-card.git`
- Branch: `main`
- HEAD: `d68ac3fd8fed29de67708e81f507c1f6a0631d5e`
- Kurz-SHA: `d68ac3f`
- Commit: `Add simple paged editor and media carousel`
- Der Code-Stand entspricht `origin/main`. Nur diese neu erzeugte Datei
  `HANDOFF.md` ist lokal noch nicht committed oder gepusht.
- HACS-Manifest: `hacs.json`
- HACS-Datei: `navdock-card.js`
- GitHub-Releases existieren bislang nicht. HACS verwendet deshalb den
  Standard-Branch und dessen Commit-SHA als Version.

## 3. Wichtige Dateien

- `navdock-card.js` – komplette Karte und visueller Editor, Vanilla JavaScript,
  kein Build-Schritt.
- `hacs.json` – HACS-Metadaten.
- `README.md` – Installation, Konfiguration und Funktionsbeschreibung.
- `LICENSE` – MIT-Lizenz.

## 4. Installation und Aktualisierung

HACS als benutzerdefiniertes Repository:

1. URL `https://github.com/smarthomebutbetter/navdock-card` eintragen.
2. Kategorie **Dashboard** auswählen.
3. NavDock Card herunterladen.
4. Home Assistant beziehungsweise die App neu laden.
5. Bei Cache-Problemen `Strg+Umschalt+R` verwenden.

Kartentyp:

```yaml
type: custom:navdock-card
```

## 5. Implementierte Funktionen

### Navigation

- Frei konfigurierbare Tabs mit Name, Icon, aktivem Icon und Navigationspfad.
- Aktiver Tab wird anhand von `window.location.pathname` bestimmt.
- Tabs können im Editor hinzugefügt, gelöscht und verschoben werden.
- Native HA-Icon-Picker für normales und aktives Icon.
- Profil-Tab mit automatischem Avatar.

### Responsive Darstellung

- Automatische Mobil-/Desktop-Erkennung anhand eines konfigurierbaren
  Breakpoints, Standard `768 px`.
- Separate Modi pro Ansicht:
  - Mobil standardmäßig `docked`.
  - Desktop standardmäßig `floating`.
- Beschriftungen pro Ansicht separat schaltbar.
- `floating`: zentriert mit Abstand zum unteren Rand.
- `docked`: kantenbündig und mit `safe-area-inset-bottom`.
- Resize-Listener aktualisiert die Variante bei geänderter Fensterbreite.

### Theme und Optik

- Verwendet HA-Variablen für Kartenfläche, Text, Sekundärfläche,
  Primärfarbe, Randbreite und Eckenradius.
- Formoptionen `Theme`, `Rund` und `Pill`.
- **Theme-abhängige Schatten:** Dark Mode mit weißem Innenring + kräftigem Schatten;
  Light Mode mit weichem Schatten ohne Ring. Prüfung via `hass.themes.darkMode`.
- Schatten ist abschaltbar.
- Keine frei einzugebende Akzentfarbe mehr; Akzent folgt `--primary-color`.

### Bearbeitungsmodus

- Karte versucht HA-Vorschau-/Editor-Kontexte über den `preview`-Setter,
  das `preview`-Attribut und bekannte `hui-*`-Hostelemente zu erkennen.
- Im Editor wird die Dock `position: relative` innerhalb ihres Kartenplatzes
  gerendert.
- Vorschau ist nicht interaktiv.
- Media- und Profilpanels werden im Editor nicht angezeigt.
- Dadurch überlagert die Fixed-Dock den Karteneditor nicht mehr.

### Media-Player

- Media-Zeile optional ein-/ausschaltbar.
- Manuell konfigurierbare `media_player`-Entitäten.
- Optionale automatische Erkennung aller `media_player`-Entitäten.
- Neue Option `media_exclude`: Liste von entity_ids zum Ignorieren bei Autoerkennung.
- Neue Option `media_include_on` (Standard: true): Zustand "on" als aktiv zählen.
- Angezeigt werden aktive Zustände: `playing`, `paused`, `buffering`, `on` (wenn enabled).
- Spielende Player werden zuerst sortiert.
- Mehrere aktive Player bilden ein Karussell:
  - Auswahlpunkte zeigen die Anzahl und aktive Position.
  - Horizontales Wischen wechselt den Player.
- Typheuristik unterscheidet Musik und TV anhand von `device_class`,
  `media_content_type`, App, Quelle und Anzeigename.
- Neue Option `media_type_overrides`: Objekt `entity_id` → `"music" | "tv"` für manuelle Typüberschreibung.
- Editor zeigt Dropdown (Auto/Musik/TV) neben jedem manuell gewählten Player.
- Musik: vorheriger Track, Play/Pause, nächster Track.
- TV: vorheriger/nächster Kanalbefehl über die entsprechenden
  Media-Player-Dienste und Quellenwahl, wenn `source_list` vorhanden ist.
- Quellenwahl ruft `media_player.select_source` auf.
- Play/Pause verwendet bewusst getrennte Dienste `media_play` und
  `media_pause`; `media_play_pause` hatte bei einem Player einen 403-Fehler
  wegen Gerätebeschränkungen verursacht.
- Großes Panel ist höher, aber nicht breiter als die konfigurierte Dock.
- Fortschritt wird während Wiedergabe lokal sekündlich aktualisiert, ohne den
  gesamten Player ständig neu zu rendern.
- Lautstärke und Seek werden über HA-Dienste gesteuert.

### Profilpanel

- Profil-Tab kann ein ausklappbares Panel statt Navigation öffnen.
- Avatar wird zuerst aus einer manuellen URL, dann aus der mit dem aktuellen
  Benutzer verknüpften `person`-Entität und danach aus Benutzerdaten ermittelt.
- **Redesign v0.7.3:** Großes rundes Avatar (border-radius 50%), einheitliche
  Info-Kacheln mit Icon-Feld und Typografie, symmetrisches Spacing-Raster.
- Optionale Informationskacheln:
  - Benutzerrolle
  - Home-Assistant-Name und Version
  - Online-/Offline-Status
  - Geräteklasse und Viewport
- Frei konfigurierbare HA-Entitäten mit Zustand.
- Entitätstipp öffnet den HA-Detaildialog.
- **Panel-Zustand visuell:** Dezenter 2px-Accent-Ring um Avatar, wenn Panel offen
  und `profile_panel_enabled` aktiv. Keine doppelte Aktiv-Pille.

### Visueller Editor

- Vier getrennte Seiten statt einer langen Konfiguration:
  - Dock
  - Tabs
  - Medien
  - Profil
- Seltene Optionen liegen in geschlossenen `details`-Bereichen.
- Media-Autoerkennung ist ein einzelner Schalter.
- Manuelle Player und Profilentitäten verwenden HA-Entity-Picker.
- Die Editor-Seite bleibt bei Konfigurationsupdates erhalten.

## 6. Architekturhinweise

- Custom Elements:
  - `navdock-card`
  - `navdock-card-editor`
- Die Karte verwendet ein eigenes Shadow DOM.
- `hass`-Updates werden über Signaturen gefiltert. Nur relevante Medien- oder
  Profildaten lösen ein vollständiges Rendern aus.
- Der Fortschritts-Timer existiert nur bei geöffnetem Player und laufender
  Wiedergabe.
- Alle HA-Dienste werden über `hass.callService` aufgerufen.
- Navigation verwendet `history.pushState` plus `location-changed`.
- Es gibt aktuell keine automatisierte Test-Suite und keinen Build-Prozess.

## 7. Bekannte Grenzen und nächste Prüfungen

1. **Echter HA-Regressionslauf erforderlich.** Syntax wurde mit
   `node --check` geprüft, aber das Verhalten muss in mehreren aktuellen
   Home-Assistant-Frontends visuell getestet werden.
2. **Editor-Erkennung ist defensiv, aber teilweise heuristisch.** Sie nutzt
   bekannte `hui-*`-Hostnamen. Nach HA-Frontend-Änderungen kann eine Anpassung
   nötig werden.
3. **Icon-Picker kontrollieren.** `ha-icon-picker` ist ein HA-internes Element.
   Darstellung und Events sollten auf Desktop, Companion-App und Tablet
   getestet werden.
4. ✅ **Media-Autoerkennung verfeinert.** Neue Optionen `media_exclude` und
   `media_include_on` ermöglichen präzisere Filterung. TV-Heuristik bleibt,
   kann aber via `media_type_overrides` pro Player überschrieben werden.
5. ✅ **TV-Erkennung mit manueller Typüberschreibung.** Neue Option
   `media_type_overrides`: Objekt entity_id → "music" | "tv".
6. **Senderwechsel ist integrationsabhängig.** Nicht jeder TV unterstützt
   `media_next_track`, `media_previous_track` oder liefert echte Sender in
   `source_list`.
7. **Swipe testen.** Pointer Events sollten insbesondere in der iOS- und
   Android-Companion-App sowie neben Range-Slidern geprüft werden.
8. **Mehrere aktive Player testen.** Indexstabilität kontrollieren, wenn ein
   Player während des Wischens inaktiv wird oder ein neuer beginnt.
9. **Panelhöhe testen.** Aktuell Media mindestens `390 px`, mobil `350 px`;
   Profil mindestens `370 px`, mobil `330 px`.
10. ✅ **Barrierefreiheit und Tastatur.** Escape schließt Panels, Fokusführung
    im geöffneten Panel auf erstes interaktives Element, Rückfokus auf
    auslösendem Tab. Klick außerhalb schließt Panels.
11. ✅ **Release-Automatisierung.** GitHub-Workflow `.github/workflows/release.yml`
    erstellt automatisch Releases auf Tag-Push mit `generate_release_notes`.

## 8. Empfohlene nächste Arbeitsschritte

1. Version `0.7.0` in HAOS über HACS neu laden und Cache hart aktualisieren.
2. Editor in normalem Dashboard-Edit-Modus und im Karten-Dialog testen.
3. Mobil angeheftet und Desktop schwebend mit demselben YAML testen.
4. Automatische Media-Erkennung mit Spotify, TV und mindestens zwei parallel
   aktiven Playern testen.
5. TV-Quellenliste und Befehlsunterstützung je Integration dokumentieren.
6. Nach den Tests zuerst Laufzeitfehler beheben, danach weitere Designarbeit.
7. Anschließend Teststruktur und Release-Automatisierung einrichten.

## 9. Letzte relevante Commits

```text
d68ac3f Add simple paged editor and media carousel
80d1e58 Fix edit preview overlays and enlarge panels
e5723f9 Simplify editor and stabilize floating shadow
722c490 Add responsive floating and docked layouts
f77ce06 Add configurable profile info panel and icon pickers
c512ff1 Add expressive editor and theme-aware shapes
1742967 Fix restricted playback commands and glass effect
b69cb6b Align HACS files with renamed repository
dfe52b0 Fix theme media updates and user avatar
30b2046 Make NavDock installable through HACS
```

## 10. Produktentscheidungen aus dem bisherigen Austausch

- Dock bleibt unten; Desktop-Seitenleiste ist derzeit nicht vorgesehen.
- Mobil und Desktop sollen mit derselben Karte unterschiedliche Positionen
  verwenden können.
- Laufzeitansicht darf im Dashboard-Editor niemals als Fixed-Overlay erscheinen.
- Design soll klar, einfach und Material-You-inspiriert sein, nicht mit vielen
  freien CSS-/Farboptionen überladen werden.
- Media- und Profilpanel sollen mehr Höhe, aber keine unnötige Breite erhalten.
- Theme-Farben und Theme-Radien haben Vorrang; Tiefenwirkung muss trotzdem bei
  dunklen Hintergründen sichtbar bleiben.
- Anfängerfreundliche Konfiguration ist wichtiger als maximale Optionszahl.
