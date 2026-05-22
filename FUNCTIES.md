# Streamline Facturatie — Functieoverzicht

*Versie: mei 2026*

---

## Inhoudsopgave

1. [Dashboard](#1-dashboard)
2. [Klanten](#2-klanten)
3. [Facturen](#3-facturen)
4. [Offertes](#4-offertes)
5. [Agenda](#5-agenda)
6. [Inkomen](#6-inkomen)
7. [Uitgaven](#7-uitgaven)
8. [Crediteuren](#8-crediteuren)
9. [Uren](#9-uren)
10. [Kilometer](#10-kilometer)
11. [Bankimport](#11-bankimport)
12. [Producten](#12-producten)
13. [Vaste Activa](#13-vaste-activa)
14. [Rapporten](#14-rapporten)
15. [Instellingen](#15-instellingen)

---

## 1. Dashboard

Het dashboard geeft een direct overzicht van de financiële situatie van je bedrijf.

### Statistieken (bovenin)
- **Omzet deze maand** — totale omzet van betaalde en verzonden facturen, inclusief vergelijking met vorige maand
- **Openstaande facturen** — totaalbedrag van alle verzonden maar nog niet betaalde facturen
- **Uitgaven deze maand** — totale zakelijke kosten, inclusief trendvergelijking
- **Netto winst** — omzet minus uitgaven, live berekend

### Grafieken en lijsten
- **Omzetgrafiek** — staafdiagram met de omzet van de afgelopen 6 maanden
- **Aankomende betalingen** — de 5 eerstvolgende vervaldatums van openstaande facturen
- **Recente facturen** — de 5 meest recentelijk aangemaakte facturen
- **Uitgaven per categorie** — taartdiagram met kostenverdeeling per categorie

### Meldingen
- **KOR-waarschuwing** — automatische melding wanneer de jaaromzet de KOR-drempel nadert of overschrijdt (instelbaar)
- **Vervallen facturen** — systeemmelding bij opstarten als er facturen zijn die al te laat zijn

---

## 2. Klanten

Beheer al je klantrelaties op één plek.

### Klantenlijst
- Klanten aanmaken, bewerken en verwijderen
- Klanten archiveren (niet langer actief) en terugzetten
- Zoeken op naam, bedrijfsnaam of e-mailadres
- Aantal facturen per klant zichtbaar in de lijst
- Rechtermuisknopmenu met snelacties

### Klantgegevens
- **Contactgegevens**: naam, bedrijfsnaam, e-mail, telefoon
- **Adres**: straat, postcode, stad, land
- **Bedrijfsgegevens**: KVK-nummer, BTW-nummer, IBAN
- **Instellingen**: standaard betaaltermijn (overschrijft de globale instelling), factuurtaal (NL/EN)
- **Notities**: vrije tekst voor interne aantekeningen over de klant

### Klantdetailpagina
Elke klant heeft een eigen detailpagina met:

- **Statistieken**: totaal gefactureerd, openstaand bedrag, totaal betaald
- **Maandelijkse omzetgrafiek** — staafdiagram van de omzet van deze klant over de afgelopen 12 maanden
- **"Nieuwe factuur" knop** — direct een factuur aanmaken voor deze klant
- **Factuurgeschiedenis** — alle facturen van deze klant met status, bedrag en datum
- **Notities & activiteit** — tijdlijn van aantekeningen die je kunt toevoegen en verwijderen
- **Documenten** — bijlagen koppelen aan een klant (contracten, offertes van derden, etc.), openen en verwijderen

---

## 3. Facturen

Het hart van de applicatie: maak, verstuur en beheer al je verkoopfacturen.

### Factuurlijst
- Filteren op status: **Alle**, **Concept**, **Verzonden**, **Betaald**, **Verlopen**
- Teller per statustab zodat je direct ziet hoeveel facturen per status er zijn
- Zoeken op factuurnummer of klantnaam
- Factuur openen, bekijken en bewerken
- Factuur dupliceren (kopie aanmaken als nieuw concept)
- Factuur verwijderen
- Rechtermuisknopmenu met: Openen, PDF downloaden, Dupliceren, Markeer als betaald, Factuurnummer kopiëren, Verwijderen

### Bulk-acties
Selecteer meerdere facturen via de checkboxes voor:
- **Markeer als betaald** — meerdere facturen in één klik op Betaald zetten
- **Verstuur selectie** — geselecteerde facturen in bulk per e-mail naar de klant versturen
- **Herinnering sturen** — betalingsherinnering sturen voor geselecteerde facturen
- **Verwijderen** — meerdere facturen tegelijk verwijderen

### Factuur aanmaken / bewerken

**Klant en datums**
- Klant selecteren (met zoekfunctie)
- Factuurdatum en vervaldatum instellen
- BTW verlegd activeren (voor buitenlandse klanten of aannemersdiensten)

**Factuurregels**
- Onbeperkt regels toevoegen
- Per regel: omschrijving, aantal, eenheid, stukprijs, BTW-tarief (0% / 6% / 9% / 21% / vrij), kortingspercentage
- Regels sorteren via drag-and-drop
- Globale korting toepassen op het totale factuurbedrag (percentage of vast bedrag)

**Sjablonen**
- Huidige factuurregels opslaan als herbruikbaar sjabloon (met naam)
- Eerder opgeslagen sjabloon laden in een nieuwe factuur
- Sjablonen beheren (bekijken, verwijderen)

**Extra opties**
- Factuurtaal instellen: **Nederlands** of **Engels** (labels en datumopmaak worden aangepast)
- Notities toevoegen (zichtbaar op de factuur)
- Betalingscondities toevoegen (zichtbaar op de factuur)

**Live totaaloverzicht**
- Subtotaal, kortingsbedrag, BTW-uitsplitsing per tarief, eindtotaal worden live bijgewerkt

### Factuurdetailpagina
- Volledig factuuroverzicht met alle gegevens
- **PDF downloaden** — sla de factuur op als PDF-bestand
- **Afdrukken** — stuur direct naar de printer
- **Versturen per e-mail** — factuur per e-mail versturen naar de klant (vereist SMTP-configuratie)
- **Versturen via WhatsApp** — factuur delen via WhatsApp-link
- **Markeer als betaald** — status bijwerken en optioneel een inkomstregistratie aanmaken
- **Creditnota aanmaken** — automatisch een creditnota genereren als tegenboeking
- **Betalingsherinnering sturen** — handmatige herinnering sturen per e-mail
- **Mollie betaallink** — iDEAL/creditcard betaallink genereren (vereist Mollie API-sleutel)
- **Betaalstatus controleren** — controleer of de Mollie-betaling is ontvangen
- **Auditlog** — tijdlijn van alle wijzigingen en acties op deze factuur

### Historische facturen
- Importeer al bestaande facturen uit een eerder systeem als historisch record (tellen mee voor omzetoverzichten, maar worden niet opnieuw verstuurd)

### Terugkerende facturen
- Stel een factuur in als terugkerend (maandelijks, kwartaal, jaarlijks)
- De app maakt automatisch een nieuwe conceptfactuur aan op de ingestelde datum

---

## 4. Offertes

Maak professionele offertes en zet ze met één klik om naar een factuur.

### Offertelijst
- Filteren op status: **Alle**, **Concept**, **Verzonden**, **Geaccepteerd**, **Afgewezen**, **Verlopen**
- Waarschuwing voor offertes die binnen 7 dagen verlopen

### Offerte aanmaken / bewerken
Dezelfde structuur als facturen:
- Klant, datum, geldigheidsdatum
- Offerteregels met dezelfde velden als factuurregels
- Globale korting
- Notities en betalingscondities

### Offertedetailpagina
- **PDF downloaden** en **afdrukken**
- **Versturen per e-mail**
- **Status wijzigen**: Geaccepteerd, Afgewezen, Verlopen
- **Omzetten naar factuur** — genereert direct een nieuwe factuur op basis van de offerte

---

## 5. Agenda

Koppel je Google Calendar aan de app voor een geïntegreerde agendaweergave.

### Kalenderweergaven
- **Dagweergave** — uurindeling van één dag
- **Weekweergave** — overzicht van een volledige week
- **Maandweergave** — maandkalender met afspraakindicatoren
- Minimaandkalender voor snelle navigatie

### Afspraken
- Alle Google Calendar-afspraken zijn zichtbaar (inclusief hele-daagse evenementen)
- Klik op een afspraak voor details (titel, tijd, locatie, beschrijving)
- **Nieuwe afspraak aanmaken** direct vanuit de app (synchroon met Google Calendar)
- **Meerdere klanten koppelen** aan één afspraak — elke klant ontvangt een aparte factuur

### Facturen vanuit afspraken
- Voeg tijdens het aanmaken van een afspraak optioneel factuurregels toe
- Genereer met één klik facturen vanuit een afspraak: voor elke gekoppelde klant wordt een aparte conceptfactuur aangemaakt met dezelfde regels
- Na aanmaken verschijnt een overzicht met links naar alle aangemaakte facturen

### Google Calendar koppeling
- Koppel je Google-account via OAuth (opent browser voor authenticatie, geen handmatig kopiëren van codes)
- Stel een primaire kalender in die getoond wordt
- Ontkoppel de koppeling via Instellingen

---

## 6. Inkomen

Registreer alle inkomsten — ook die niet via een factuur binnenkomen.

### Inkomstenoverzicht
- **Totale inkomsten** deze maand
- **Gekoppeld aan factuur** — bedrag dat als betaling op een factuur is geboekt
- **Niet gekoppeld** — los ontvangen bedrag

### Inkomstenbeheer
- Inkomstregistratie aanmaken, bewerken en verwijderen
- Filteren op maand
- Velden: datum, omschrijving, bedrag, bron (Bank, Contant, PayPal, iDEAL, Overig)

### Koppelen aan facturen
- Handmatig een inkomst koppelen aan een openstaande factuur
- **Slim matchen** — automatisch zoeken naar overeenkomende factuur op basis van bedrag en datum
- Na koppeling wordt de factuur automatisch op "Betaald" gezet
- Koppeling ongedaan maken

---

## 7. Uitgaven

Houd alle zakelijke kosten bij, inclusief bonnen en BTW-administratie.

### Uitgavenoverzicht
- Totale uitgaven en BTW op inkopen deze maand
- Top 3 kostenposten per categorie
- Filteren op maand en categorie

### Uitgavenbeheer
- Uitgave aanmaken, bewerken en verwijderen
- Velden: datum, omschrijving, bedrag (excl. BTW), BTW-tarief, BTW-bedrag, leverancier, categorie, notities

### Bonnen en OCR
- **Bon selecteren en koppelen** aan een uitgave (bestand wordt opgeslagen in de app)
- **Bon openen** vanuit de app
- **AI-scan (OCR)** — upload een foto of PDF van een bon; de AI leest automatisch het bedrag, de leverancier en de datum uit en vult het formulier in (vereist Anthropic of OpenAI API-sleutel)

### Zakelijk vs. privé
- Markeer een uitgave als zakelijk of privé
- Stel een zakelijk percentage in voor gemengd gebruik (bijv. 75% zakelijk)

### Categorieën
- Maak eigen kostenposten categorieën aan met naam, kleur en icoon
- Stel een standaard BTW-tarief per categorie in
- Categorieën zijn zichtbaar in de uitgavenlijst en in rapporten

---

## 8. Crediteuren

Beheer de facturen die jij moet betalen aan leveranciers.

### Crediteurenlijst
- Filteren op status: **Alle** of **Openstaand**
- Statistieken: totaal openstaand, totaal betaald
- Vervallen facturen worden visueel gemarkeerd

### Leveranciersfacturen
- Aanmaken, bewerken en verwijderen
- Markeer als betaald (inclusief betaaldatum)
- Velden: leverancier, factuurnummer, factuurdatum, vervaldatum, bedrag, BTW-tarief, status, notities

---

## 9. Uren

Registreer gewerkte uren per klant of project en zet ze om naar een factuur.

### Tijdregistratie
- **Ingebouwde timer** — start en stop via een knop; de timer loopt door ook als je andere pagina's bezoekt
- **Handmatig invoeren** — start- en eindtijd opgeven
- Negatieve duur wordt geblokkeerd (eindtijd moet na starttijd liggen)
- Filteren op week

### Urenvelden
- Datum, omschrijving, klant (optioneel), projectnaam (optioneel), starttijd, eindtijd, berekende duur, uurtarief, notities

### Factureren
- Selecteer uren van één of meerdere klanten en genereer direct een factuur met de uren als factuurregels
- Gefactureerde uren worden gemarkeerd als "gefactureerd"

---

## 10. Kilometer

Bijhouden van zakelijke ritten voor de belastingaftrek of doorbelasting aan klanten.

### Kilometerregistratie
- Rit aanmaken, bewerken en verwijderen
- Velden: datum, omschrijving, vertrekpunt (van), bestemming (naar), kilometers, retour (ja/nee), zakelijk, notities
- Bij retour wordt het kilometertotaal automatisch verdubbeld

### Vergoeding en doorbelasting
- Kilometervergoeding (€/km) instelbaar in de instellingen (standaard €0,23)
- Automatische berekening van de vergoeding per rit
- **Doorbelasten** — selecteer ritten en genereer direct een factuur voor de klant
- Gefactureerde ritten worden als zodanig gemarkeerd

### Export
- Exporteer rittenlijst naar CSV (te openen in Excel)

---

## 11. Bankimport

Importeer bankafschriften en koppel transacties aan facturen.

### Ondersteunde banken
- **ABN AMRO** (CSV-formaat)
- **ING** (CSV-formaat)
- **Rabobank** (CSV-formaat)
- **Knab** (CSV-formaat)
- **Overig / handmatige mapping** — voor andere banken of CSV-formaten

### Importproces
1. Kies je bank en upload het CSV-bestand (of gebruik automatische bewaking, zie hieronder)
2. Bekijk een preview van de transacties
3. **Duplicaatdetectie** — transacties die al eerder zijn geïmporteerd worden overgeslagen
4. Importeer nieuwe transacties als inkomstregistraties

### Handmatige kolomkoppeling
Voor onbekende CSV-formaten:
- Stel handmatig in welke kolom de datum, omschrijving, bedrag en debet/credit bevat
- Stel het datumformaat en het scheidingsteken in

### Transacties koppelen aan facturen
- **Automatisch matchen** — de app zoekt facturen die overeenkomen met het bedrag en de datum van een transactie
- Handmatig een transactie koppelen aan een openstaande factuur
- Na koppeling wordt de factuur automatisch als betaald gemarkeerd

### Bankfeed automatisering
- Stel een bewakingsmap in in de instellingen
- De app bewaakt de map automatisch; bij een nieuw CSV/MT940/XML-bestand verschijnt een melding in de app
- Klik op "Importeren" in de melding om direct naar de bankimportpagina te gaan

---

## 12. Producten

Maak een catalogus van vaste producten of diensten voor sneller factureren.

### Productbeheer
- Product aanmaken, bewerken en verwijderen
- Velden: naam, omschrijving, prijs (excl. BTW), eenheid (stuks / uur / dag / maand / km / kg / m² / project), BTW-tarief

### Gebruik bij factureren
Producten zijn beschikbaar als snelkeuze wanneer je factuurregels toevoegt, zodat je veelgebruikte diensten niet steeds opnieuw hoeft in te typen.

---

## 13. Vaste Activa

Registreer bedrijfsmiddelen en volg de jaarlijkse afschrijvingen.

### Activabeheer
- Actief aanmaken, bewerken en verwijderen
- Velden: naam, aanschafdatum, aanschafwaarde, afschrijvingsjaren, restwaarde, categorie, notities

### Afschrijvingsberekening
- **Lineaire afschrijving** — gelijke afschrijving per jaar
- **Degressieve afschrijving** — hogere afschrijving in de beginjaren
- Automatische berekening van huidige boekwaarde op basis van aanschafdatum

### Overzicht
- Totale aanschafwaarde van alle activa
- Huidige totale boekwaarde
- Totale afschrijving dit jaar

---

## 14. Rapporten

Uitgebreide financiële rapportages voor inzicht en belastingaangifte.

### Winst & Verlies
- Weergave per maand, kwartaal of jaar
- Staafdiagram: omzet vs. kosten per periode
- Lijngrafiek: netto winstontwikkeling
- Totalen: totale omzet, totale kosten, netto winst/verlies
- Exporteren naar Excel

### BTW-overzicht
- BTW-samenvatting per kwartaal of per jaar
- Uitsplitsing van BTW 21%, 9%, 0% en BTW verlegd
- Te betalen BTW berekend (ontvangen BTW minus betaalde BTW op inkopen)
- Export naar PDF voor belastingaangifte

### BTW-aangifte
- Vooringevuld overzicht in de structuur van de Nederlandse BTW-aangifte (rubrieken 1a t/m 5g)
- Selecteer het kwartaal en het jaar

### Factuurstatus
- Taartdiagram met verdeling van factuurstatussen (concept, verzonden, betaald, verlopen)
- Totaalbedragen per status

### Debiteurenanalyse
- Overzicht van alle openstaande facturen
- Uitsplitsing naar ouderdom (current, 30/60/90+ dagen te laat)

### Balans
- Samenvattend overzicht van activa en passiva

### Cashflow
- Visualisatie van inkomsten en uitgaven over de tijd

### Inkomensschatting
- Bereken een schatting van het netto inkomen op basis van geplande omzet, kosten en belastingaftrekposten

---

## 15. Instellingen

Configureer de applicatie volledig naar jouw wensen.

### Bedrijfsgegevens
Gegevens die op facturen en offertes worden afgedrukt:
- Naam contactpersoon, bedrijfsnaam, e-mailadres, telefoonnummer
- Adres, postcode, stad
- KVK-nummer, BTW-nummer, IBAN
- Website
- Logo uploaden (wordt op facturen getoond)

### Facturen
- Factuurprefix en volgnummer (bijv. "F2025-0001")
- Factuurformaat instellen (bijv. `{PREFIX}{JAAR}-{NNNN}`)
- Standaard betaaltermijn in dagen
- Standaard BTW-tarief
- Standaard geldigheid offertes (in dagen)
- Automatische betalingsherinneringen in- of uitschakelen
- Aantal dagen na vervaldatum voor herinnering
- Standaard creditnotaprefix

### Factuurlayout
Pas het uiterlijk van je facturen aan:
- **Primaire kleur** — accentkleur voor kopteksten en lijnen
- **Secundaire kleur** — optionele tweede kleur
- **Lettertype** — kies uit beschikbare lettertypen
- **Lettergrootte** — van 12 tot 16px
- **Regelspatiëring** — krap, normaal of ruim
- **Logogrootte** — klein, normaal of groot
- **Logoplaatsing** — links, midden of rechts
- **Marges** — krap, normaal of ruim
- **Koptekst en voettekst** — vrije tekst die op elke factuur staat
- **Toon/verberg**: BTW-nummer, KVK-nummer, IBAN, QR-code
- **Sectievolgorde** — pas de volgorde van blokken op de factuur aan via drag-and-drop
- **Live preview** — alle wijzigingen zijn direct zichtbaar in een schaalbaar voorbeeld

### E-mail (SMTP)
- SMTP-server configureren (host, poort, gebruikersnaam, wachtwoord, SSL/TLS)
- **Test e-mail versturen** om de configuratie te controleren
- E-mail aanhef en afsluitingstekst instellen (worden gebruikt in factuur- en herinneringsmails)

### Google Agenda
- Google Calendar koppelen via OAuth (browser-authenticatie, geen handmatige codes)
- Eigen Google OAuth-credentials instellen (Client ID en Client Secret)
- Primaire kalender selecteren
- Gekoppeld account weergeven
- Koppeling verwijderen

### KOR (Kleineondernemersregeling)
- KOR activeren of deactiveren
- KOR-drempel instellen (standaard €20.000)
- Waarschuwing bij nadering van de drempel in- of uitschakelen

### AI / OCR
- **Anthropic (Claude) API-sleutel** instellen voor bonherkenning
- **OpenAI API-sleutel** instellen als alternatief
- Voorkeurs-AI-model selecteren

### Overig
- **Kilometervergoeding** (€/km) instellen
- **Bewakingsmap bankafschriften** instellen voor automatische importmelding

### Navigatie
- Pagina's verbergen uit het hoofdmenu
- Verborgen pagina's zijn terug te vinden in een uitklapbare "Meer"-sectie onderaan de sidebar
- Dashboard en Instellingen kunnen nooit worden verborgen

### Geavanceerd
- **PDF-opslagmap** — kies een standaardmap voor gedownloade PDF's
- **Mollie API-sleutel** — voor het genereren van iDEAL betaallinks
- **Donkere modus** — licht, donker of systeeminstelling
- **Automatisch opstarten** — start de app automatisch bij aanmelden op de computer
- **Database backup** — maak een backup van de volledige database
- **Exporteer alles naar CSV** — exporteer alle gegevens (klanten, facturen, uren, km, inkomen, uitgaven)
- **Excel-export per jaar** — jaarexport van alle financiële gegevens naar Excel
- **PDF-archief aanmaken** — genereer een ZIP met alle factuur-PDF's van een jaar

---

## Overige systeemfuncties

### Donkere modus
De volledige interface ondersteunt een lichte en donkere modus, met de optie om de systeeminstelling te volgen.

### Automatische updates
- De app controleert automatisch op beschikbare updates
- Bij een beschikbare update verschijnt een melding in de interface
- De update kan direct worden geïnstalleerd vanuit de app

### Beveiliging
- De app vereist een account (e-mail + wachtwoord) bij de eerste keer opstarten
- Wachtwoord wordt gehashed opgeslagen (bcrypt)
- Alle gegevens worden lokaal opgeslagen (SQLite database in de gebruikersmap)

### Meertalige facturen
Facturen en offertes kunnen worden gegenereerd in het **Nederlands** of **Engels**. Alle labels, BTW-omschrijvingen en datumformaten worden automatisch aangepast.

### Auditlog
Voor elke factuur wordt een auditlog bijgehouden van alle wijzigingen en acties (aangemaakt, verstuurd, betaald, creditnota, etc.).
