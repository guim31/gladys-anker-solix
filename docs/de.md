# Anker SOLIX

Verfolge in Gladys deine Solarbatterien **Anker SOLIX Solarbank** (E1600,
Solarbank 2, Solarbank 3), den **Smart Meter** und die **Smart Plugs** von
Anker sowie die **MI80**-Mikrowechselrichter eines Systems: Batteriestand,
Laden und Entladen, Solarertrag, Leistung zum Haus, Netzbezug und
Netzeinspeisung. Mit der Option „Einstellungen erlauben“ kann Gladys auch den
**Betriebsmodus** und die **Ausgangsleistung** einer Solarbank 2 oder 3
ändern.

Die Integration läuft über die Anker-Cloud, wie die Anker-App, und spricht
nicht direkt mit den Geräten.

> **Ohne die Hardware entwickelt**: Grundlage sind echte Antworten der
> Cloud, die die Bibliothek
> [anker-solix-api](https://github.com/thomluther/anker-solix-api)
> veröffentlicht. Rückmeldungen sind willkommen. Unabhängige Integration,
> keine Verbindung zu Anker Innovations.

## Überblick

- Ein Gladys-Gerät pro **Solarbank**, **Mikrowechselrichter**, **Zähler** und
  **Steckdose** jedes Anker-Systems, dazu ein Gerät **„Anker SOLIX
  <System>“** für das, was zum ganzen System gehört (Betriebsmodus,
  Hausverbrauch, Solarertrag).
- Die Werte werden jede Minute neu gelesen (einstellbar), und nur geänderte
  Werte gehen an Gladys.
- Der gesamte Solarertrag ist ein **Zählerstand** (kWh): Die
  Energieüberwachung von Gladys 5.2 berechnet daraus den Ertrag pro halbe
  Stunde.
- Ein Dashboard-Widget zeigt den Energiefluss: Sonne → Batterie → Haus / Netz,
  und den Batteriestand.

## Voraussetzungen

- Gladys **5.2.0** oder neuer.
- Ein in der **Anker-App** eingerichtetes System („Power System“): Für ein
  Gerät, das zu keinem System gehört, veröffentlicht die Cloud keine Werte.
- Das Anker-Konto (E-Mail, Passwort, das bei der Kontoerstellung gewählte
  Land).

**Empfohlenes Konto: ein zweites.** Lange Zeit akzeptierte die Anker-Cloud nur
eine Sitzung pro Konto: Die Anmeldung von Gladys meldete die App auf dem
Handy ab. Seit App-Version 3.10 (Juli 2025) lässt sich ein Konto parallel
nutzen, am sichersten bleibt aber ein zweites Anker-Konto (andere
E-Mail-Adresse), mit dem du dein **System in der App teilst** (Freigabe für
Familienmitglieder). Ein geteiltes Konto („Mitglied“) sieht alle Werte, kann
aber **keine Einstellungen ändern**: Um Modus und Leistung aus Gladys zu
steuern, brauchst du das Besitzerkonto.

## Konfiguration

1. Installiere die Integration über **Integrationen → Von GitHub
   installieren** (oder aus dem Store, sobald sie veröffentlicht ist).
2. Gib im Tab **Konfiguration** ein:
   - **E-Mail** und **Passwort** des Anker-Kontos;
   - **Land des Kontos**: den zweistelligen Code, der bei der Kontoerstellung
     gewählt wurde (`DE`, `AT`, `CH`, `FR`, `ES`, `US`…). Er wählt den
     Anker-Server (Europa oder Rest der Welt); ein falsches Land ergibt eine
     erfolgreiche Anmeldung, aber kein System;
   - **Sprache der Namen**: Sprache der Funktionsnamen und der Meldungen
     (standardmäßig Französisch);
   - **Aktualisierungsintervall**: 1, 2 oder 5 Minuten. Die Anker-Cloud
     aktualisiert nicht schneller (bei vielen Solarbank 2 alle 5 Minuten);
   - **Einstellungen erlauben**: standardmäßig aus, Gladys liest dann nur.
3. Speichere, dann **Verbindung testen**: Die Meldung nennt die Anzahl der
   gefundenen Systeme und Geräte.
4. Füge die Geräte im Tab **Erkennung** hinzu.

Das Sitzungstoken wird in `/data` gespeichert (nie das Passwort), damit die
Integration sich nicht bei jedem Neustart neu anmeldet.

## Geräte

**Anker SOLIX <System>** (eins pro Anker-System):

| Funktion           | Details                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Betriebsmodus      | Solarbank 2 und 3: Smart Meter, smarte Steckdosen, manueller Plan, KI-Modus (Solarbank 3), und nur lesbar Notladung, Tarifzeiten, dynamischer Tarif |
| Hausverbrauch      | W, mit einem Zähler im System                                                                                                                       |
| Solarertrag gesamt | kWh, Zählerstand seit Inbetriebnahme                                                                                                                |
| Solarertrag heute  | kWh, alle 5 Minuten gelesen                                                                                                                         |

**Solarbank** (E1600, Solarbank 2 Pro / Plus / AC, Solarbank 3):

| Funktion                       | Details                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| Batteriestand                  | %                                                                |
| Gespeicherte Energie           | kWh, aus der Kapazität des Modells und der Erweiterungsbatterien |
| Ladeleistung / Entladeleistung | W, immer positiv                                                 |
| Solarleistung                  | W, alle Eingänge                                                 |
| Solareingang 1 bis 4           | W, pro Eingang, wenn die Cloud ihn liefert (Solarbank 2 und 3)   |
| Leistung zum Haus              | W, Ausgang der Solarbank                                         |

**Mikrowechselrichter** (MI80 in einem System): Solarleistung (W).

**Zähler** (Anker Smart Meter, Shelly 3EM / Pro 3EM): Netzbezug und
Netzeinspeisung (W).

**Steckdose** (Anker Smart Plug): Leistungsverbrauch (W).

Der **Betriebsmodus** erscheint im Dashboard als Tasten. Ein Tippen wirkt nur,
wenn „Einstellungen erlauben“ an ist (sonst sagt Gladys, warum, und zeigt
wieder den echten Modus).

## Widget

Das Widget **Anker SOLIX** (Einstellung: das System, optional) zeigt:

- den **Batteriestand** als Anzeige;
- **Solar**, **Laden / Entladen**, **Zum Haus** und **Netzbezug /
  Einspeisung** (mit einem Zähler): Der Energiefluss liest sich von links
  nach rechts;
- den Betriebsmodus, die Ausgangsvorgabe, die gespeicherte Energie, den
  Tagesertrag und die Geräte, die offline sind;
- mit „Einstellungen erlauben“ und dem Besitzerkonto zwei Tasten, die ein
  Formular öffnen: **Leistung** (manueller Plan) und **Modus**.

## Szenen-Auslöser und -Aktionen

Auslöser:

- **Betriebsmodus geändert**: Der Modus hat sich außerhalb von Gladys
  geändert (Anker-App, Notladung, KI-Modus). Filter: System, neuer Modus.
  Variablen: neuer Modus (Schlüssel und Bezeichnung), vorheriger Modus. Eine
  Änderung durch Gladys löst ihn nicht aus.
- **Gerät offline oder zurück**: Eine Solarbank, ein Zähler oder eine
  Steckdose meldet sich nicht mehr bei der Anker-Cloud (zwei Lesungen in
  Folge) oder wieder. Filter: Gerät, Zustand. Variablen: Name, Zustand.

„Batterie voll“ und „Batterie unter einer Schwelle“ sind keine Auslöser der
Integration: Der Gladys-Auslöser **„Änderung von Gerätestatus“** auf dem **Batteriestand**
mit „Nur ausführen, wenn der Schwellenwert überschritten wird“ erledigt das bereits.

Aktionen („Einstellungen erlauben“ an, Besitzerkonto, Solarbank 2 oder 3):

- **Ausgangsleistung einstellen**: ändert die Leistung des aktuellen
  Zeitraums des manuellen Plans (auf 10 W gerundet, vom System begrenzt).
  Ausgabe: angewendete Leistung. Der Modus muss „Manueller Plan“ sein.
- **Betriebsmodus ändern**: Smart Meter, smarte Steckdosen, manueller Plan
  oder KI-Modus. Ausgabe: angewendeter Modus.

Sonst wird nie etwas geschrieben (keine Firmware, keine Batteriereserve,
keine Grenzwerte).

## Szenenbeispiele

- **Waschmaschine mit dem Überschuss starten**: Auslöser „Änderung von Gerätestatus“ auf
  _Netzeinspeisung_ über 500 W für 10 Minuten → Steckdose der Waschmaschine
  einschalten.
- **Batterie voll**: Auslöser „Änderung von Gerätestatus“ auf _Batteriestand_ ≥ 100, nur beim
  Überschreiten des Schwellenwerts → Benachrichtigung „Batterie voll, genieß die
  Sonne“.
- **Abend**: um 18 Uhr → Aktion „Ausgangsleistung einstellen“ auf 300 W; um
  23 Uhr → 100 W (manueller Plan).
- **Warnung**: „Gerät offline oder zurück“, Zustand _offline_ →
  Benachrichtigung mit `{{triggerEvent.data.device_name}}`.

## Fehlerbehebung

- **„Die Anker-Cloud hat die E-Mail-Adresse oder das Passwort abgelehnt“**:
  Prüfe sie in der Anker-App. Gladys versucht es erst nach erneutem Speichern
  der Konfiguration wieder, damit das Konto nicht gesperrt wird.
- **Bestätigungscode verlangt**: Melde dich einmal in der Anker-App am Konto
  an und speichere dann die Konfiguration.
- **Verbunden, aber kein System**: falsches Land des Kontos, oder das System
  ist nicht mit diesem Konto geteilt.
- **Werte bewegen sich nicht**: Die Cloud aktualisiert eine Solarbank 2
  manchmal nur alle 5 Minuten; prüfe, ob die Anker-App aktuelle Werte zeigt.
- **Einstellung abgelehnt**: „Einstellungen erlauben“ aus, Mitgliedskonto,
  Solarbank 1 oder für die Leistung ein anderer Modus als „Manueller Plan“.
- Ausführliche Protokolle: Variable `LOG_LEVEL=debug` des Containers. Die
  Protokolle enthalten nie die E-Mail-Adresse, das Passwort oder das Token.

## Grenzen

- **Ohne die Hardware entwickelt**: getestet mit echten Antworten der Cloud,
  die anker-solix-api veröffentlicht, nicht an einer Anlage. Rückmeldungen
  willkommen.
- Nur Cloud: Ohne Internet oder wenn Anker seine API ändert, gibt es keine
  Werte mehr. Die Werte hängen 1 bis 5 Minuten hinterher.
- Kontingente: eine Lesung pro System und Intervall, der Tagesertrag alle 5
  Minuten, höchstens eine Anfrage alle 0,5 s; die Cloud begrenzt jeden
  Endpunkt auf etwa zehn Anfragen pro Minute.
- Einstellungen nur für Solarbank 2 und 3 (Modus, Leistung des aktuellen
  Zeitraums); die Solarbank 1 ist nur lesbar.
- Tragbare Powerstationen (Solix C/F), Power Panel und X1: Die Cloud liefert
  ihre Werte nicht über diese API (sie laufen über MQTT), sie werden nicht
  unterstützt. Solarbank 4 und Solarbank Max: gelesen, wenn die Cloud sie im
  System aufführt, ohne Einstellungen und ungetestet.
- Die Steckdosen werden gelesen, nicht geschaltet.
