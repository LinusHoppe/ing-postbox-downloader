# ING Postbox Bulk Download

Ein Userscript für **Firefox + Violentmonkey**, das alle aktuell sichtbaren Dokumente in der ING-Postbox nacheinander herunterlädt. Das Skript ist für den lokalen Eigengebrauch gedacht und setzt bewusst auf eine minimale, nachvollziehbare Logik statt auf fremden Blackbox-Code.

Die aktuelle Version verwendet den **nativen Klick auf den vorhandenen Download-Link** pro Dokumentzeile, weil dieser Weg in der Praxis zuverlässig funktioniert, während programmatische Downloads bei ING-Links in Redirect-/CORS-Probleme laufen können.

## Ziel

Die ING-Postbox bietet in der Oberfläche nur Einzel-Downloads je Dokument. Dieses Skript ergänzt in der Postbox einen Button, der alle **sichtbaren** Dokumente nacheinander herunterlädt, inklusive konfigurierbarer Verzögerung und Dry-Run-Modus zur sicheren Prüfung der Erkennung ohne echte Downloads.

Das Projekt ist ausdrücklich auf **Selbstentwicklung und Transparenz** ausgerichtet. Öffentliche Vorlagen waren nur Ausgangspunkt zur Orientierung; die eigentliche Weiterentwicklung soll lokal kontrollierbar, lesbar und anpassbar bleiben.

## Funktionsumfang

- Download aller aktuell sichtbaren Dokumente in der Postbox
- Nacheinander statt parallel, damit Browser und Website nicht mit vielen gleichzeitigen Aktionen belastet werden
- Dry-Run-Modus zum Testen der Dokumenterkennung ohne echten Download
- Einstellbare Wartezeit zwischen zwei Downloads
- Debug-Logging für DOM-Analyse und Fehlersuche
- Automatische Re-Initialisierung der UI, wenn ING Teile der Oberfläche dynamisch neu rendert

## Technischer Ansatz

Das Skript läuft als Violentmonkey-Userscript direkt im Browser auf den ING-Postbox-Seiten.

Die Dokumentzeilen werden per DOM-Selektoren gesammelt und innerhalb jeder Zeile wird der vorhandene Download-Link identifiziert. Für direkte Kindselektoren innerhalb einer Zeile wird `:scope` verwendet, damit die Selektion sauber relativ zum aktuellen Element funktioniert.

Der eigentliche Download erfolgt nicht über `fetch()`, sondern über einen nativen Klick auf das gefundene Element. Das passt besser zum UI-gesteuerten Workflow der ING-Postbox.

## Warum kein Dateiname-Template?

Frühere Varianten hatten eine Logik zur Umbenennung der Dateien. Diese wurde bewusst entfernt, weil sich gezeigt hat, dass der stabile Download-Pfad über den nativen Browser-Klick läuft und dabei der endgültige Dateiname vom Server-Response bzw. vom Browser-Downloadpfad bestimmt wird.

Kurz gesagt: **stabiler Download** war wichtiger als **künstliche Umbenennung**.

## Voraussetzungen

Für den Einsatz werden benötigt:

- Firefox als Browser
- Die Erweiterung Violentmonkey für Firefox
- Ein lokal installiertes Userscript aus diesem Repository
- Ein eingeloggter Zugriff auf die ING-Postbox

## Installation

1. Violentmonkey in Firefox installieren.
2. Ein neues Userscript in Violentmonkey anlegen oder die `.user.js`-Datei aus diesem Repository importieren.
3. Das Skript speichern.
4. Die ING-Postbox öffnen oder neu laden.
5. Prüfen, ob unterhalb des Filterbereichs ein zusätzlicher Button **„Alle herunterladen“** erscheint.

## Verwendung

### Normaler Ablauf

1. In der ING-Postbox die gewünschte Liste anzeigen, also z. B. nach Zeitraum oder Dokumenttyp filtern.
2. Optional zuerst den Dry-Run aktivieren.
3. Auf **„Alle herunterladen“** klicken.
4. Das Skript arbeitet die aktuell sichtbaren Dokumente nacheinander ab.
5. Ein erneuter Klick auf denselben Button bricht den Vorgang ab.

Wichtig: Das Skript verarbeitet nur **die aktuell sichtbaren Dokumente**. Es führt bewusst keine Pagination und kein automatisches Nachladen weiterer Seiten aus.

### Dry-Run

Im Dry-Run werden alle sichtbaren Dokumente erkannt und in der Logik durchlaufen, ohne echte Downloads auszulösen. Das ist der empfohlene erste Test nach Änderungen an Selektoren oder interner Logik.

### Delay

Die Wartezeit zwischen zwei Downloads lässt sich konfigurieren. Eine kleine Verzögerung ist sinnvoll, damit die Oberfläche, Firefox und der Download-Manager sauber Schritt halten.

### Debug-Logs

Wenn **Debug-Logs** aktiviert sind, schreibt das Skript zusätzliche Informationen in die Browser-Konsole. Das ist hilfreich, um DOM-Änderungen, Selektor-Probleme oder nicht erkannte Elemente zu analysieren.

## UI-Elemente

Das Skript blendet ein kleines Bedienfeld in der Postbox ein. Der aktuelle Stand von Version 0.3 umfasst:

| Element | Funktion |
|---|---|
| Alle herunterladen | Startet den sequentiellen Download aller sichtbaren Dokumente. Während der Ausführung dient derselbe Button auch zum Abbrechen. |
| Dry-Run (kein Download) | Prüft nur die Erkennung der Dokumente, ohne echte Downloads auszulösen. |
| Debug-Logs | Aktiviert zusätzliche Konsolenausgaben für Analyse und Fehlersuche. |
| Delay (ms) | Definiert die Wartezeit zwischen zwei Download-Aktionen. |
| Statuszeile | Zeigt Anzahl sichtbarer Dokumente sowie Fortschritt, Abschluss oder Abbruch an. |

## Einschränkungen

### Nur sichtbare Dokumente

Das Skript lädt nur die Dokumente herunter, die auf der aktuellen Seite sichtbar sind. Das ist Absicht, damit die Logik vorhersehbar bleibt und nicht unbemerkt durch weitere Seiten navigiert.

### Abhängigkeit vom DOM

Das Skript ist an die aktuelle HTML-Struktur der ING-Postbox gebunden. Wenn ING Klassennamen, Button-Struktur, Tabellenaufbau oder dynamische Renderlogik ändert, müssen Selektoren oder Erkennungslogik angepasst werden.

### Kein garantierter Dateiname

Der Browser bzw. die Server-Antwort bestimmt den finalen Dateinamen. Eine freie Umbenennung wurde aus Stabilitätsgründen nicht weiterverfolgt.

### Kein API-Ansatz

Das Projekt verwendet keine offizielle ING-API für Dokumente. Es automatisiert ausschließlich die vorhandene Web-Oberfläche, also einen UI-Workflow im eingeloggten Browser-Kontext.

## Sicherheit

Das Skript ist für sensible Bankdaten bewusst auf einen **lokalen, nachvollziehbaren Ansatz** reduziert. Es sendet keine Daten an Dritte, verwendet keine externen Tracking-Dienste und greift nur auf die im eingeloggten Browserkontext vorhandene ING-Postbox zu.

Empfohlene Sicherheitsprinzipien:

- Nur selbst verstandenen Code ausführen
- Änderungen immer zuerst im Dry-Run testen
- Das Repository privat halten, wenn interne Anpassungen oder persönliche Hinweise enthalten sind
- Logs vor dem Teilen anonymisieren, da Dokumenttitel oder Metadaten sichtbar sein können
- Den `@match`-Bereich bewusst eng auf die ING-Postbox beschränken

## Architektur

Die interne Struktur des Skripts ist bewusst einfach gehalten:

- **Konfiguration**: Selektoren, Defaults und Storage-Keys
- **State**: Laufstatus, Abbruchflag, Fortschritt, Observer-Referenzen
- **DOM-Erkennung**: Sammeln der Zeilen und Finden des Download-Links pro Dokument
- **Aktion**: Nativer Klick auf das gefundene Element
- **UI**: Bedienfeld mit Start, Dry-Run, Debug und Delay
- **Reaktivität**: `MutationObserver`, um das Panel nach DOM-Updates wieder korrekt einzubinden

## Typischer Ablauf im Code

1. Nach dem Laden der Seite versucht das Skript, den Filterbereich als UI-Anker zu finden.
2. Dort wird das eigene Bedienfeld eingefügt.
3. Beim Start werden alle sichtbaren Tabellenzeilen gesammelt.
4. Pro Zeile wird der Download-Link identifiziert.
5. Im Echtbetrieb wird pro Dokument ein nativer Klick ausgelöst.
6. Zwischen zwei Dokumenten wartet das Skript die konfigurierte Zeit.
7. Ein erneuter Klick setzt ein Abbruch-Flag und beendet den Lauf sauber nach dem aktuellen Schritt.

## Persistente Einstellungen

Die Benutzereinstellungen werden im Userscript-Speicher abgelegt.

Gespeichert werden aktuell:

| Schlüssel | Bedeutung |
|---|---|
| `ing.delayMs` | Verzögerung zwischen zwei Downloads in Millisekunden |
| `ing.dryRun` | Merkt, ob der Dry-Run zuletzt aktiviert war |
| `ing.debug` | Merkt, ob Debug-Logging aktiv ist |

## Debugging

### Browser-Konsole

Die wichtigste Diagnosequelle ist die Firefox-Konsole. Dort erscheinen bei aktiviertem Debug-Modus unter anderem:

- gefundene Dokumente
- erkannte Link-Kandidaten pro Zeile
- der ausgewählte Download-Link
- Fortschrittsinformationen
- Fehler beim Klick- oder DOM-Ablauf

### Wichtige Prüfpunkte

Wenn das Skript nach Änderungen nicht mehr funktioniert, sollten zuerst diese Punkte geprüft werden:

1. Gibt es noch einen passenden UI-Anker unter `.account-filters`?
2. Stimmen die Zeilen noch mit `.ibbr-table-body .ibbr-table-row` überein?
3. Sind die Spalten weiterhin direkte Kinder, die über `:scope > span.ibbr-table-cell:not(:last-child)` erreichbar sind?
4. Existiert in jeder Dokumentzeile weiterhin ein anklickbarer Download-Link?
5. Öffnet ein manueller Klick auf denselben Link noch einen gültigen Download?

### Typische Fehlerbilder

| Problem | Wahrscheinliche Ursache | Hinweis |
|---|---|---|
| Kein Button sichtbar | UI-Anker nicht gefunden | Prüfen, ob `.account-filters` noch existiert |
| Dry-Run findet 0 Dokumente | Tabellen- oder Zellselektoren passen nicht mehr | DOM in Firefox Inspector prüfen |
| Download startet nicht | ING hat Link- oder Event-Struktur geändert | Link-Kandidaten mit Debug-Logs analysieren |
| UI verschwindet nach Filterwechsel | DOM wurde dynamisch neu gerendert | Observer- und Selektor-Logik prüfen |

## Anpassung an DOM-Änderungen

Wenn ING die Oberfläche ändert, sind normalerweise nur wenige Bereiche relevant:

- `uiAnchorSelector`
- `rowSelector`
- `cellSelector`
- Erkennungslogik in `findDownloadLink()`
- eventuell der Selektor für den Button **„Weitere Funktionen“**

Am schnellsten findet sich ein neuer Selektor über die Firefox-DevTools. Per Inspector lässt sich das relevante Element auswählen und der CSS-Selektor analysieren; für direkte Kindelemente innerhalb eines Knotens ist `:scope` oft die robusteste Variante.

## Bekannte Designentscheidungen

### Keine Pagination

Das Skript verarbeitet nur die aktuelle Ansicht. Das vermeidet zusätzliche Navigationslogik, Wartezustände, Seitenwechsel und schwer nachvollziehbare Fehlerketten.

### Keine Dateiumbenennung

Der Name wird vom Browser bzw. Server akzeptiert, nicht künstlich überschrieben. Das erhöht die Zuverlässigkeit des eigentlichen Download-Vorgangs.

### Keine externen Laufzeit-Abhängigkeiten

Die aktuelle Fassung kommt ohne jQuery oder zusätzliche UI-Bibliotheken aus. Das vereinfacht Wartung, Debugging und Kontrolle über den ausgeführten Code.

## Entwicklungshinweise

Für Änderungen am Skript empfiehlt sich dieser Ablauf:

1. Änderungen lokal in Violentmonkey einpflegen.
2. Seite neu laden.
3. Dry-Run aktivieren.
4. Konsole beobachten.
5. Erst danach mit wenigen sichtbaren Dokumenten einen echten Test ausführen.
6. Erst nach erfolgreichem Test breiter einsetzen.

## Nicht-Ziele

Dieses Projekt verfolgt bewusst **nicht** diese Ziele:

- vollständige Archiv-Synchronisation
- serverseitige Automatisierung
- Nutzung einer offiziellen oder inoffiziellen Backend-API
- Umbenennung erzwingen um jeden Preis
- Mehrbenutzer- oder Mandantenbetrieb
- Browser-übergreifende Spezialanpassungen außerhalb von Firefox

## Herkunft und Einordnung

Die Grundidee ist nicht neu; rund um die ING-Postbox existieren öffentliche Beispiele und Blogbeiträge zu Batch-Downloads per Userscript.

Diese Implementierung versteht sich jedoch als **eigene, reduzierte und lokal kontrollierte Variante** für den privaten Einsatz.

## Haftungsausschluss

Die Nutzung erfolgt auf eigenes Risiko. Das Skript ist ein nicht offizielles Hilfsmittel zur Browser-Automatisierung und steht in keiner Verbindung zur ING. Änderungen an der Website können die Funktion jederzeit beeinflussen.

Vor produktiver Nutzung sollte das Verhalten immer mit wenigen Dokumenten getestet werden. Besonders bei Bankdokumenten sind Vorsicht, lokale Kontrolle und ein bewusst enger Einsatzbereich sinnvoll.