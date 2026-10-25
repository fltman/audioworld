# Punktredigeraren

Punktredigeraren öppnas till höger när du skapar en punkt (under **Place a point**) eller öppnar en befintlig (klicka på den på kartan eller på **Edit** i punktlistan). Rubriken säger "New Static", "Edit Path" och så vidare, med typens färg.

Fälten visas uppifrån och ner i den ordning som beskrivs här. Vissa fält finns bara för vissa typer – det står vid varje fält.

> [!NOTE]
> Ingenting sparas förrän du klickar på **Save** längst ner. **Cancel** stänger utan att spara.

## Placering {#placering}

Överst står punktens status:

- **Static, Circling, Follow:** "Click the map to set the center." (eller "…start point.") tills du klickat på kartan, sedan "Placed · drag the marker to adjust". Klicka på kartan igen eller dra markören för att flytta punkten.
- **Path, Triggered:** medan du ritar står det hur många hörn stigen har, med knapparna **Undo** och **Finish path**. När stigen är klar står det "… points · drag to adjust" och knappen **+ Add points**. Se [Rita en stig](#help/stopp/rita).

## Name {#namn}

Punktens namn. Det syns för besökaren i radarn och på kartan och används i punktlistan. Krävs – utan namn säger redigeraren "Name is required." när du sparar.

## Ljudet {#ljudet}

Här skiljer sig typerna åt:

- **Static, Circling, Follow** har först **Facts / notes — what this point is about**, sedan **✨ Narrate this point**, sedan spelaren **Audio clip** när det finns ett klipp, och sist den hopfällda **Set the audio manually**.
- **Path, Triggered** har **Travelling audio** – ljudet som spelas medan punkten rör sig – med valen **URL** och **Upload** och en spelare. Berättelser läggs i stället i stoppen; se [Vandrande ljud och guidade stopp](#help/stopp).

Alla typer har den hopfällda **Narration languages** för språkversioner.

Hur du skriver fakta, låter AI skriva och läsa in berättelsen, laddar upp egna filer och lägger till språk beskrivs i [Berättarröst, ljudklipp och språk](#help/berattelse).

## Volume {#volym}

Reglaget **Volume** (0–100 %) styr punktens styrka i förhållande till de andra. 100 % är full styrka när besökaren står vid ljudet. Sänk miljöljud och loopar så att de inte dränker berättelserna.

## Uppspelning {#uppspelning}

Tre kryssrutor:

| Kryssruta | Betyder |
|---|---|
| **Loop while in range** | Klippet spelas om och om igen så länge besökaren är inom räckhåll. Påslaget från början för nya punkter. |
| **Play once** | Klippet spelas en gång och är sedan tyst även om besökaren står kvar. Lämnar besökaren området och kommer tillbaka spelas det igen. Har företräde framför **Loop while in range**. |
| **Restart on re-entry** | Klippet börjar om från början varje gång besökaren kommer in i räckvidden. |

Utan **Restart on re-entry** fortsätter klippet att gå (tyst) när besökaren går utanför, och hörs där det är när besökaren kommer tillbaka. Det skyddar en berättelse från att börja om när GPS:en hoppar till.

**Pause before looping (s)** visas när **Loop while in range** är påslaget: antal sekunders tystnad mellan varje varv. 0 = sömlöst. Bra för ett ljud som ska återkomma då och då, som en kyrkklocka eller ett rop.

## Mått och fart {#matt}

Sifferfälten beror på typen. Värdena inom parentes är vad en ny punkt får från början.

| Fält | Typer | Betyder |
|---|---|---|
| **Audible radius (m)** | Static (50), Circling (50), Path (50) | Hur långt bort ljudet hörs. Starkast vid ljudet, tyst vid kanten. |
| **Jumpscare trigger radius (m) — 0 = off** | Static (0) | Ljudet är tyst tills besökaren kommer så här nära, och spelar sedan inom den hörbara radien. |
| **Reveal after standing still (s) — 0 = off** | Static (0) | Ljudet hörs först när besökaren stått still så många sekunder inom räckvidden. |
| **Orbit radius (m)** | Circling (30) | Hur stor cirkel ljudet åker. |
| **Speed (m/s)** | Circling (2), Path (2), Triggered (2) | Hur fort ljudet rör sig. Under fältet står en påminnelse: gång 5 km/h ≈ 1,4 · jogg 9 km/h ≈ 2,5 · cykel 15 km/h ≈ 4,2 m/s. |
| **Trigger radius (m)** | Follow (30), Triggered (40) | Hur nära besökaren måste komma för att ljudet ska börja följa efter eller ge sig av. För Triggered är det också den hörbara radien. |
| **End behavior** | Path, Triggered (Loop) | Vad som händer vid stigens slut: **Loop** (börja om från början), **Reverse** (vänd och gå tillbaka), **Stop — then fall silent** (stanna, tystna och försvinn från besökarens radar och karta). |
| **Height (m · + up / − down)** | Alla (0) | Ljudets höjd över (plus) eller under (minus) besökaren. Kyrkklockor i ett torn kan ligga på +20. |

Under Static-fälten står en förklaring av hur skräckeffekten och "stå still" fungerar.

## Flees on movement {#flyr}

Bara **Static**. Kryssrutan **Flees on movement (audible only while the listener is still)** gör att ljudet bara hörs när besökaren står still. Så fort besökaren rör sig tystnar det.

## Riktat ljud {#riktat}

Bara **Static**, **Path** och **Triggered**. Kryssrutan **Directional — radiates one way (not heard behind it)** gör att ljudet bara hörs inom en kil, som ljud från en öppen dörr eller en högtalare mot en vägg. Två fält visas:

- **Facing (° from N)** – kilens riktning i kompassgrader: 0 = norr, 90 = öster, 180 = söder, 270 = väster.
- **Spread (° wide)** – hur bred kilen är, mellan 10 och 350 grader.

Den som står utanför kilen hör inget. På kartan ritas en Static-punkts kil i stället för cirkeln.

## Följsätt (Follow) {#folj}

Bara **Follow**. **Follow behavior** väljer hur ljudet följer besökaren när det väl har startat:

| Läge | Gör | Extra fält |
|---|---|---|
| **Attach — rides on top of you** | Sitter på besökaren, mitt i huvudet. | – |
| **Chase — pursues; you can outrun it** | Jagar besökaren. Går besökaren fortare än **Max speed (m/s)** (1,5) kommer den undan, och på längre avstånd än **Give-up distance (m)** (80) ger ljudet upp. | **Max speed (m/s)**, **Give-up distance (m)** |
| **Orbit — circles around you** | Kretsar runt besökaren. | **Follow radius (m)** (8), **Orbit speed (m/s)** (2) |
| **Side to side — sweeps left ↔ right** | Sveper fram och tillbaka från öra till öra. | **Follow radius (m)** (8), **Sweep speed (m/s)** (2) |

## Guide och stopp {#guide-stopp}

Bara **Path** och **Triggered**: **Guide for the whole path** och listan **Stops · pause & narrate (arrival time shown)**. De beskrivs i [Vandrande ljud och guidade stopp](#help/stopp).

## Hidden {#dold}

**Hidden on the listener's screen — heard, not seen** gör att punkten hörs som vanligt men aldrig syns i besökarens radar eller karta. Bra för miljöljud och överraskningar. I punktlistan märks den med **hidden**.

## Next sound(s) {#nasta}

Välj vilken eller vilka punkter besökaren ska ta sig till när den här har hörts. Se [Nästa ljud](#help/flaggor/nasta-ljud).

## Riktning till ljudet och vänta på besökaren {#vagvisning}

Bara **Path** och **Triggered**:

- **Show direction & distance to this sound** – besökaren får en pil och ett avstånd till det rörliga ljudet, så att den hittar tillbaka till exempel till guiden.
- **Wait for the listener (pause when out of leash range)** – ljudet stannar och väntar när besökaren kommer längre bort än **Leash / resume radius (m)** (60), och fortsätter när besökaren är tillbaka inom det avståndet. Då blir tiden alltid individuell.

Se [Vänta på besökaren](#help/stopp/vanta).

## Flaggor och vägval {#flaggor}

Tre textfält styr i vilken ordning saker låses upp:

- **Sets flags when visited** – flaggor som sätts när besökaren hört punkten, kommaseparerade (t.ex. `SLOTTET, NYCKEL`).
- **Requires flags to activate** – punkten är tyst och osynlig tills alla de här flaggorna är satta.
- **Exclusive group (crossroads)** – ett gruppnamn för ett vägval. Den första punkten i gruppen som besökaren når vinner, och de andras flaggor låses.

Se [Styra berättelsen](#help/flaggor).

## Timing {#timing}

Bara **Circling**, och **Path** när **Wait for the listener** är avslaget. Två lägen:

- **Individual** – varje besökare har sin egen klocka. Ljudet börjar från början när besökaren startar rundan. Standard.
- **Global** – alla besökare delar samma klocka: ljudet är på samma plats och på samma ställe i klippet för alla, samtidigt. Det står "Shared timeline — same position & the same moment in the loop for every listener." Bra för något som ska kännas verkligt för en grupp, som en båt i hamnen.

Med **Global** visas knappen **Sync start to now**, som sätter den gemensamma klockans nollpunkt till just nu. Utan den sätts nollpunkten när du sparar första gången.

## Spara, avbryt, ta bort {#spara}

- **Save** – sparar punkten. Redigeraren stängs. Saknas något säger redigeraren vad: "Name is required.", "Click the map to place the center.", "Click the map to place the start point." eller "Draw at least two path points."
- **Cancel** – stänger utan att spara.
- **Delete** (bara för befintliga punkter) – byter mot **Yes, delete** och **Keep**. **Yes, delete** tar bort punkten för gott.

En punkt utan ljud kan sparas, men rundan går inte att publicera förrän punkten fått ljud (se [Flight check](#help/publicera/flight-check)).
