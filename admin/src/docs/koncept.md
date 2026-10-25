# Så fungerar AudioWorld

AudioWorld har två delar:

- **Admin** – det här verktyget, där du bygger rundor vid datorn.
- **Lyssnarappen** – webbsidan besökaren öppnar på mobilen. Den behöver inte installeras; en länk eller en QR-kod räcker.

Ljudet räknas fram i besökarens telefon. Mobilen vet var besökaren står (GPS) och åt vilket håll den pekar (kompassen), och placerar varje ljud i hörlurarna åt rätt håll och med rätt styrka.

## Vad besökaren upplever {#besokaren}

1. **Startsidan.** Besökaren öppnar länken och ser rundans omslagsbild, namn, längd, ungefärlig tid och antal ljud, och din beskrivning. Kortet **Where it starts** visar en karta med startpunkten och rutten, och länken **Directions ↗** öppnar vägbeskrivning dit. Under **Before you go** finns en checklista (hörlurar, volym, tillåt plats och kompass), knappen **▶ Test sound** som spelar en ton som sveper från vänster till höger, och **↓ Save for offline** som laddar ner karta och ljud i förväg.
2. **Start.** Besökaren trycker på startknappen och tillåter plats och rörelsesensorer. På iPhone kräver kompassen ett tryck och en säker anslutning (https), vilket den publicerade länken alltid har.
3. **Under rundan.** Besökaren går med hörlurar. Ljud hörs när besökaren kommer inom deras räckvidd och blir starkare närmare. Vrider besökaren på sig ligger ljuden kvar där de är i världen. Överst kan besökaren växla mellan **radar** och **karta**.
4. **Avbrott.** Laddar sidan om mitt i rundan kan besökaren fortsätta med **Resume walk** – det besökaren redan hört och de vägval som gjorts finns kvar.

### Radarn {#radar}

Radarn visar omgivningen med besökarens blickriktning uppåt. Ljud som hörs just nu syns som punkter i radarn. Längs kanten pekar pilar mot de **tre närmaste ljud som besökaren inte hör ännu**, med namn och avstånd. Ljud besökaren redan hört visas blekare.

- Har du angett [nästa ljud](#help/flaggor/nasta-ljud) för en punkt pekar radarn i stället mot det ljudet med en gul pil märkt "Next: …".
- Är **Show listeners the direction to the start point** påslaget i [inställningarna](#help/installningar/lyssna-och-dela) pekar en pil mot startpunkten.
- Dolda punkter, punkter som är låsta av [flaggor](#help/flaggor) och vandrande ljud som har gått klart syns aldrig.

### Kartan {#karta}

Kartvyn visar besökarens position, rutten du ritat (streckad) och ljuden. Dolda och låsta punkter visas inte här heller.

## Hur ljudet räknas fram {#ljudet}

- **Riktning** kommer från telefonens kompass, inte från GPS. Därför fungerar det även när besökaren står still.
- **Avstånd** avgör styrkan. Ett ljud är tyst utanför sin hörbara radie och blir starkare ju närmare besökaren kommer.
- **Höjd** – ett ljud kan placeras ovanför eller under besökaren, till exempel kyrkklockor i ett torn.
- **Rörelse** – ljud som rör sig byter tonhöjd en aning när de passerar (dopplereffekt), och avlägsna ljud låter dovare, som i verkligheten.
- **Rörliga ljud** (stigar, cirklande och följande ljud) räknas fram i telefonen från en klocka, så de rör sig mjukt utan att behöva kontakt med servern hela tiden.

## Hörbar radie och triggerradie {#radier}

Två slags cirklar återkommer överallt:

| Begrepp | Betyder | Syns på kartan som |
|---|---|---|
| **Hörbar radie** (*Audible radius*) | Hur långt bort ljudet hörs. Utanför är det tyst. | Hel cirkel i punktens färg |
| **Triggerradie** (*Trigger radius*) | Hur nära besökaren måste komma för att något ska *starta* – ett ljud som börjar följa efter, en stig som börjar röra sig, eller en skräckeffekt. | Streckad cirkel |

Läs om varje punkttyp i [De fem punkttyperna](#help/punkttyper).

## Utkast och publicerad version {#publicerat}

Allt du gör i admin är ett **utkast**. Besökarna hör den version du senast **publicerade**. När du ändrar något efter publiceringen visar publiceringsraden **Unpublished changes**, och ändringen når besökarna först när du klickar på **Publish changes**. Listan med rundor i lyssnarappen visar bara publicerade rundor. Se [Publicera och dela](#help/publicera).

## Uppspelning: loopa, spela en gång, börja om {#uppspelning}

Varje punkt har tre kryssrutor som styr hur klippet spelas när besökaren är inom räckhåll:

- **Loop while in range** – klippet spelas om och om igen, bra för miljöljud.
- **Play once** – klippet spelas en gång och är sedan tyst så länge besökaren är kvar. Bra för berättelser.
- **Restart on re-entry** – klippet börjar om från början varje gång besökaren går in i räckvidden igen.

Utan **Restart on re-entry** fortsätter ett klipp att gå tyst när besökaren lämnar räckvidden, så att en berättelse inte börjar om bara för att GPS:en hoppar till en sekund. Detaljer finns i [Punktredigeraren](#help/punktredigeraren/uppspelning).

## Individuell eller gemensam tid {#tid}

Rörliga ljud kan ha **individuell** tid (varje besökare har sin egen klocka och ljudet startar när besökaren startar) eller **gemensam** tid (alla besökare hör ljudet på samma plats i samma ögonblick, som om det fanns där på riktigt). Se [Timing](#help/punktredigeraren/timing).

## Berättelseflaggor och vägval {#flaggor}

Med **flaggor** kan en punkt låsa upp andra: ljud B hörs först när besökaren har hört ljud A. Med en **exklusiv grupp** bygger du vägval där besökaren väljer en väg och den andra stängs. Med **nästa ljud** visar du besökaren vart den ska gå härnäst. Se [Styra berättelsen](#help/flaggor).

## Akustiska zoner {#zoner}

En zon är ett område på kartan med egen klang (efterklang som i ett rum, en sal, en katedral eller en tunnel) och en egen bakgrundsloop. När besökaren går in i zonen hörs allt med zonens klang och loopen tonas in. Se [Akustiska zoner](#help/zoner).

## Språkversioner {#sprak}

En punkt kan ha inspelningar på flera språk. Besökaren hör automatiskt den som matchar telefonens språk, och annars huvudklippet. Se [Narration languages](#help/berattelse/sprak).

## Eyes-up: navigera utan att titta på skärmen {#eyes-up}

Med **Eyes-up mode** påslaget i [inställningarna](#help/installningar/lyssna-och-dela) döljs radarn och kartan i lyssnarappen. Besökaren stoppar telefonen i fickan och följer ett ekolodspip som kommer från riktningen till närmaste ljud som besökaren inte hört ännu. Pipet går tätare ju närmare besökaren kommer, och en ljusare ton betyder att ett nytt ljud har kommit inom hörhåll.

## Prova på datorn {#simulering}

Du kan gå en publicerad runda på datorn utan GPS:

- På rundans startsida i lyssnarappen finns länken **Try it on this screen**.
- Eller lägg till `?sim=1` sist i adressen till lyssnarappen.

Simuleringen startar vid rutten början (annars vid första punkten). Klicka på kartan för att gå dit, eller använd samma tangenter som i [Provlyssna](#help/provlyssna). I admin gör **▶ Playtest** samma sak med ditt utkast.

## Fältscouting {#scout}

Lyssnarappen har ett scoutläge för att samla platser ute i verkligheten: öppna lyssnarappens adress med `/?scout` på mobilen, logga in, skapa ett set och markera platser med anteckningar, foton och röstanteckningar. Platserna kan sedan visas och göras om till ljudpunkter i admin. Se [Scout](#help/scout).
