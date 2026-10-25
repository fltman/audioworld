# Kartan

Kartan i mitten av fliken **Courses** är där du placerar och formar allt. Kartbilden kommer från OpenStreetMap.

## Flytta och zooma {#navigera}

- **Dra** med musen för att flytta kartan.
- **Zooma** med scrollhjulet, med **+** och **−** uppe till vänster, eller genom att dubbelklicka (utom när du ritar – då avslutar dubbelklicket det du ritar).
- När du byter runda zoomar kartan så att alla punkter syns.

## Go to place {#sok}

Sökrutan **Go to place…** uppe på kartan hittar en plats via OpenStreetMap. Skriv ett namn eller en adress och klicka på **Go** (eller tryck [[Enter]]). Kartan hoppar till första träffen. Hittas inget står det **Not found**.

## Symboler på kartan {#symboler}

Teckenförklaringen nere till höger visar punkttypernas färger. Så här läser du resten:

| Det du ser | Betyder |
|---|---|
| Rund markör med bokstav (S, C, P, F, T) | En punkt. Färgen visar typen. Klicka för att öppna den. |
| Hel cirkel i punktens färg | Den hörbara radien – här hörs ljudet. |
| Streckad cirkel | En triggerradie – här startar något (Follow, Triggered, eller Static med skräckeffekt). |
| Kilformat fält i stället för cirkel | En riktad punkt (**Directional**) – ljudet hörs bara inom kilen. |
| Prickad cirkel kring en markör | Banan för en **Circling**-punkt. |
| Linje i punktens färg | Stigen för en **Path**- eller **Triggered**-punkt. |
| Små tidsetiketter (t.ex. "1:30") längs en stig | När ljudet når hörnet, räknat från start. Etiketter vid stopp är markerade. |
| Ljuslila prickad linje med pilspets | [Nästa ljud](#help/flaggor/nasta-ljud) – från en punkt till den eller de punkter den leder vidare till. |
| Gul-orange streckad linje | Den [planerade rutten](#help/rutt), från en fylld startprick till en ring vid målet. |
| Turkosa fält | [Akustiska zoner](#help/zoner). För muspekaren över för namn och klang. |
| Gröna droppformade nålar | Platser som [Discover](#help/upptack) hittat. Bock = vald. |
| Numrerade nålar | Platser från ett [scoutset](#help/scout). Klicka för anteckning, röstanteckning och GPS-noggrannhet. |
| Orange moln | [Statistikens](#help/statistik) värmekarta – där besökare uppehållit sig. |
| Limegröna numrerade märken | Det [AI-assistenten](#help/ai-assistent/kartan) visar just nu. |
| Lila figur med en kon | Den virtuella lyssnaren under [provlyssning](#help/provlyssna). Konen visar blickriktningen. |

## Klicka och dubbelklicka {#klick}

Vad ett klick gör beror på vad du håller på med:

| Läge | Klick på kartan | Klick på en punkt | Dubbelklick |
|---|---|---|---|
| Inget öppet | – | Öppnar punkten i redigeraren | Zoomar |
| Ny eller öppen Static, Circling eller Follow | Flyttar punkten dit | Öppnar den punkten i stället | Zoomar |
| Ritar en stig (Path, Triggered) | Lägger till ett hörn | Viker in punkten i stigen (se [Vika in punkter](#help/stopp/vika-in)) | Avslutar stigen (minst 2 hörn) |
| Ritar en zon | Lägger till ett hörn | Undvik – rita klart först | Avslutar zonen (minst 3 hörn) |
| Ritar rutten | Lägger till ett hörn | Undvik – rita klart först | Avslutar rutten (minst 2 hörn) |
| **☑ Multi-select** | – | Väljer eller väljer bort punkten | Zoomar |
| **🔍 Discover** med träffar | – | En grön nål väljs eller väljs bort. En vanlig punkt öppnas (och Discover stängs). | Zoomar |
| Provlyssning | Lyssnaren går dit | Lyssnaren går till punkten | Zoomar |

> [!WARNING]
> Medan en Static-, Circling- eller Follow-punkt är öppen i redigeraren flyttar *varje* klick på kartan punkten dit. Klickar du på en annan punkt öppnas den i stället, och osparade ändringar i den första försvinner. Spara först.

När du placerar en ny punkt eller ritar blir muspekaren ett hårkors.

## Dra för att justera {#dra}

- **Markören** för en öppen punkt går att dra till en ny plats.
- **Stigens hörn** (små runda handtag) går att dra när stigen är öppen i redigeraren.
- **Rutten hörn** går att dra när verktyget **〰 Route** är öppet. Rutten sparas direkt när du släpper.
- **Lyssnaren** under provlyssning går att dra – den hoppar dit du släpper och du hör svepet medan du drar.

Ändringar av punkter sparas först när du klickar på **Save** i redigeraren.

## Det AI-assistenten visar {#ai-markeringar}

När AI-assistenten förklarar något på kartan visas en remsa överst: **✨ Shown by the assistant (n)**. Klicka på **Clear** för att ta bort markeringarna. De kommer tillbaka om du klickar på **Show again** i chatten. Se [AI-assistenten](#help/ai-assistent/kartan).
