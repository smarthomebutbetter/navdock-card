# NavDock Card

Schwebende Navigation für Home-Assistant-Dashboards mit responsiver Breite,
Theme-Anpassung, Profil-Tab und optionalem Media-Player. Ein Tipp auf die
kompakte Media-Zeile öffnet den erweiterten Player direkt oberhalb der Dock.

## Installation

### HACS (empfohlen)

[![Repository in HACS öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=smarthomebutbetter&repository=navdock-card&category=plugin)

Oder manuell in HACS: **Drei-Punkte-Menü → Benutzerdefinierte Repositories**,
`https://github.com/smarthomebutbetter/navdock-card` eintragen und als Kategorie
**Dashboard** auswählen. Danach **NavDock Card** herunterladen. HACS installiert
die JavaScript-Datei und registriert die Dashboard-Ressource automatisch.

Nach der Installation den Browser mit `Strg+Umschalt+R` neu laden oder die
Home-Assistant-App neu starten. Anschließend im visuellen Karteneditor
**NavDock Card** auswählen.

### Manuell

1. `navdock-card.js` nach `/config/www/navdock-card.js` kopieren.
2. Unter **Einstellungen → Dashboards → Ressourcen** `/local/navdock-card.js`
   als **JavaScript-Modul** anlegen.
3. Browser beziehungsweise Companion-App neu laden.

## Minimale Konfiguration

```yaml
type: custom:navdock-card
media_players:
  - media_player.wohnzimmer
```

Tabs, Reihenfolge, Icons, Navigationspfade, Media-Player, Profil-Avatar,
Dock-Breite und Abstand zum unteren Rand lassen sich im visuellen Editor
einstellen.

Der Editor bietet Material-You-inspirierte Bereiche für Form, Größe, Tabs,
Media-Player und Profil. Mit der Formoption **Theme** folgen Ecken, Rahmen und
Schatten automatisch den Kartenwerten des aktiven Home-Assistant-Themes.

Ohne manuell gesetzte Avatar-URL verwendet NavDock automatisch das Bild der
`person`-Entität, die mit dem aktuell angemeldeten Home-Assistant-Benutzer
verknüpft ist. Farben, Flächen, Text und Schatten werden aus dem aktiven
Home-Assistant-Theme übernommen.

Play/Pause verwendet getrennte `media_play`- und `media_pause`-Dienste, damit
auch Player funktionieren, die den kombinierten `media_play_pause`-Befehl
wegen Gerätebeschränkungen ablehnen.

Der Profil-Tab kann ein eigenes ausklappbares Panel öffnen. Im visuellen Editor
lassen sich Benutzerrolle, Home-Assistant-Version, Verbindungsstatus,
Browser-Gerät und zusätzliche frei gewählte Entitäten ein- oder ausblenden.
Ein Tipp auf eine hinzugefügte Entität öffnet deren HA-Detaildialog. Die
Navigation-Tabs besitzen native Icon-Picker für normales und aktives Icon.

NavDock erkennt Mobil- und Desktopansichten automatisch über einen frei
einstellbaren Breakpoint. Für beide Ansichten lassen sich **Schwebend** oder
**Angeheftet** und die Sichtbarkeit der Beschriftungen getrennt festlegen. Die
jeweilige Einstellung greift automatisch anhand der aktuellen Bildschirmbreite.
Im angehefteten Modus sitzt die Dock kantenbündig mit Safe-Area-Abstand; Panels
und Media-Player bleiben auf eine gut lesbare Breite begrenzt. Im schwebenden
Modus sorgt ein eigener Tiefenschatten auch bei Themes ohne Kartenschatten für
eine klare Trennung vom scrollenden Dashboard-Inhalt.

Im Dashboard-Bearbeitungsmodus wechselt NavDock automatisch in eine eingebettete
Vorschau. Sie bleibt innerhalb ihres Kartenplatzes, ist nicht interaktiv und
überlagert weder den Konfigurationsdialog noch andere Dashboard-Karten. Media-
und Profilpanel werden im normalen Betrieb breiter als die Dock dargestellt,
bleiben auf kleinen Bildschirmen aber responsiv.

## Vollständiges Beispiel

```yaml
type: custom:navdock-card
width: 520
bottom: 18
tabs:
  - label: Brief
    icon: mdi:creation-outline
    active_icon: mdi:creation
    path: /dashboard-home/tab-brief
  - label: Räume
    icon: mdi:home-outline
    active_icon: mdi:home
    path: /dashboard-home/tab-gerate
  - label: Home
    icon: mdi:home-assistant
    path: /dashboard-home/home
  - label: Apps
    icon: mdi:view-grid-outline
    active_icon: mdi:view-grid
    path: /dashboard-home/apps
media_enabled: true
expanded_player: true
media_players:
  - media_player.mdi_og_02_01
  - media_player.mdi_og_02_02
profile_enabled: true
profile_label: Profil
profile_path: /profile
profile_avatar: /local/avatar.png
```

Der erste Player im Zustand `playing` wird angezeigt. Falls keiner spielt,
wird der erste Player in `paused`, `buffering` oder `on` verwendet. Player in
`idle`, `off`, `unknown` oder `unavailable` blenden die Media-Zeile aus.

Im erweiterten Player stehen Cover, Titel, Interpret, Fortschritt, Lautstärke,
Zurück, Play/Pause und Weiter zur Verfügung. Solange er geöffnet ist, wird die
kompakte Media-Zeile ausgeblendet. Ein Klick außerhalb oder auf den Pfeil klappt
ihn wieder ein und zeigt die kompakte Zeile erneut.
