# Akustiska zoner

En akustisk zon är ett område på kartan med egen **klang** och en egen **bakgrundsloop**. Står besökaren i zonen hörs alla ljud med zonens efterklang, och loopen tonas in. Lämnar besökaren zonen tonas loopen ut.

Öppna verktyget med **🔊 Zones (n)** under **Tools**. Siffran är antalet zoner. Rubriken i panelen är "Acoustic zones (n)", och står det **· unsaved** efter har du osparade ändringar.

> [!WARNING]
> Zoner sparas inte automatiskt. Klicka på **Save zone changes** när du är klar, annars försvinner ändringarna när du byter runda eller laddar om sidan.

## Rita en zon {#rita}

1. Klicka på **+ Draw a zone**.
2. Klicka ut zonens hörn på kartan. Raden visar antalet: "4 corners · click the map, then finish (need 3+)".
3. Klicka på **Finish** (eller dubbelklicka på kartan) när du har minst tre hörn. **Cancel** avbryter.

Den nya zonen heter "Zone 1", "Zone 2" och så vidare, har klangen **room** och 50 % efterklang. På kartan blir den ett turkost fält; för muspekaren över det för att se namn och klang.

Zonens form går inte att ändra i efterhand. Rita om den och ta bort den gamla.

## Inställningar per zon {#installningar}

Varje zon har en egen rad i panelen:

- **Namn** – textfältet överst. Syns bara för dig.
- **Klang** – rullistan bredvid namnet:

| Klang | Låter som |
|---|---|
| **outdoor** | Öppen plats utomhus, kort och luftig |
| **room** | Ett vanligt rum |
| **hall** | En stor sal |
| **cathedral** | En kyrka eller katedral, lång efterklang |
| **tunnel** | En tunnel eller valvport, hårt eko |

- **reverb n%** – hur mycket efterklang som blandas in (0–100 %).
- **background loop** – zonens bakgrundsljud, från en av tre källor:
  - **Library** – välj ett klipp ur [ljudbiblioteket](#help/ljud), sorterat i **Sound effects**, **Other clips** och **Voices**. **— None —** = ingen loop.
  - **Upload** – ladda upp en ny fil. Den hamnar också i biblioteket.
  - **Link** – klistra in en länk till en ljudfil någon annanstans.
- **ambience volume n%** – loopens styrka (visas när en loop är vald). Från början 60 %.

## Förhandslyssna {#forhandslyssna}

**▶ Preview** spelar zonen för sig: bakgrundsloopen i sin volym plus ett testljud genom zonens klang. Knappen blir **■ Stop preview**. Medan du lyssnar kan du ändra klang, efterklang, loop och volym och höra skillnaden direkt.

Rullistan **test sound, through the zone's reverb** väljer testljud:

- **Hand clap** – en handklapp, bra för att höra efterklangen.
- **This course's sounds** – något av rundans egna ljud.
- **None — background only** – bara loopen.

Bara en zon kan förhandslyssnas åt gången. Ännu bättre är att [provlyssna](#help/provlyssna) och gå in i zonen – där kan du dessutom ställa loopens volym på gehör.

## Ta bort en zon {#ta-bort}

**Delete zone** byter mot **Yes, delete** och **Cancel**. Kom ihåg **Save zone changes** efteråt – borttagningen sparas också först då.

## Överlappande zoner {#overlapp}

Zoner får överlappa. Där de gör det gäller den zon som ligger längst ner i listan (den som ritades sist). Rita alltså en stor zon för hela området först och mindre zoner inuti efteråt, till exempel en stor "Gamla stan" med en "Valvporten" inuti.

## Tips {#tips}

- Håll bakgrundsloopar lågt, 30–50 %, så att berättelserna hörs.
- Välj loopar som går runt sömlöst. Ljudeffekter du genererar i biblioteket är ofta bra.
- **tunnel** och **cathedral** gör stor skillnad på röster – prova med en berättelse som testljud innan du bestämmer dig.
