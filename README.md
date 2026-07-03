# NavDock Card

Schwebende Navigation für Home-Assistant-Dashboards mit responsiver Breite,
Theme-Anpassung, Profil-Tab und optionalem Media-Player. Ein Tipp auf die
kompakte Media-Zeile öffnet den erweiterten Player direkt oberhalb der Dock.

## Installation

### HACS (empfohlen)

[![Repository in HACS öffnen](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=smarthomebutbetter&repository=navdock&category=plugin)

Oder manuell in HACS: **Drei-Punkte-Menü → Benutzerdefinierte Repositories**,
`https://github.com/smarthomebutbetter/navdock` eintragen und als Kategorie
**Dashboard** auswählen. Danach **NavDock Card** herunterladen. HACS installiert
die JavaScript-Datei und registriert die Dashboard-Ressource automatisch.

Nach der Installation den Browser mit `Strg+Umschalt+R` neu laden oder die
Home-Assistant-App neu starten. Anschließend im visuellen Karteneditor
**NavDock Card** auswählen.

### Manuell

1. `navdock.js` nach `/config/www/navdock.js` kopieren.
2. Unter **Einstellungen → Dashboards → Ressourcen** `/local/navdock.js`
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
