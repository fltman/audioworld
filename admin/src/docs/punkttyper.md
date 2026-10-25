# De fem punkttyperna

Varje ljud i en runda är en **punkt**. Det finns fem typer. Alla har samma grundinställningar (namn, ljud, volym, uppspelning, flaggor med mera), men de skiljer sig i hur ljudet rör sig och när det startar.

| Typ | Bokstav och färg | Kort sagt | Exempel |
|---|---|---|---|
| **Static** | S, blå | Står still på en plats och hörs inom en radie. | En berättelse vid en staty, sorl från ett kafé. |
| **Circling** | C, turkos | Cirklar runt en mittpunkt. | Måsar som kretsar över hamnen. |
| **Path** | P, orange | Vandrar längs en linje hela tiden. | En häst och vagn som kör runt kvarteret, en guide som går före. |
| **Follow** | F, rosa | Väntar tills besökaren kommer nära, sedan följer den efter. | Steg bakom besökaren, en humla som surrar runt huvudet. |
| **Triggered** | T, lila | Väntar vid stigens början tills besökaren kommer nära, sedan ger den sig av längs stigen. | En kanonkula som viner förbi, ett tåg som rullar iväg. |

Bokstaven och färgen syns på kartan, i punktlistan och i kartans teckenförklaring.

## Static – ljud på en plats {#static}

Det vanligaste. Ett ljud står på en plats och hörs inom **Audible radius (m)**. Klicka på kartan för att placera mittpunkten och dra markören för att flytta den.

Static har några extra knep:

- **Jumpscare trigger radius (m)** – ljudet är tyst tills besökaren kommer inom triggerradien, och spelar sedan inom den hörbara radien. Kombinera med **Play once** för en överraskning. 0 = av.
- **Reveal after standing still (s)** – ljudet hörs först när besökaren har stått still så många sekunder inom räckvidden. 0 = av.
- **Flees on movement** – ljudet hörs bara medan besökaren står still och tystnar när besökaren rör sig. Bra för något skyggt, ett barn som nynnar eller en viskning.
- **Directional** – ljudet strålar bara åt ett håll, som en högtalare mot en vägg. Se [Riktat ljud](#help/punktredigeraren/riktat).

## Circling – ljud som cirklar {#circling}

Ljudet åker runt en mittpunkt. **Orbit radius (m)** anger cirkelns storlek och **Speed (m/s)** hur fort ljudet åker. **Audible radius (m)** räknas från ljudets aktuella position. På kartan syns banan som en prickad cirkel och den hörbara radien som en hel cirkel.

## Path – ljud längs en stig {#path}

Ljudet färdas längs en linje du ritar, i **Speed (m/s)**, och hörs inom **Audible radius (m)** från där det befinner sig just nu. När det kommer till slutet gör det det som **End behavior** säger: **Loop** (börjar om från början), **Reverse** (vänder och går tillbaka) eller **Stop — then fall silent** (stannar, tystnar och försvinner från besökarens radar och karta).

En stig kan ha **stopp** där ljudet stannar och berättar, och den kan vänta på besökaren. Det gör den perfekt för en guide som går före. Se [Vandrande ljud och guidade stopp](#help/stopp).

## Follow – ljud som följer efter {#follow}

Ljudet står vid en startpunkt tills besökaren kommer inom **Trigger radius (m)** (streckad cirkel). Sedan följer det besökaren på ett av fyra sätt (**Follow behavior**):

- **Attach — rides on top of you** – ljudet sitter på besökaren, mitt i huvudet.
- **Chase — pursues; you can outrun it** – ljudet jagar besökaren med högst **Max speed (m/s)**. Kommer besökaren längre bort än **Give-up distance (m)** ger det upp.
- **Orbit — circles around you** – ljudet kretsar runt besökaren på **Follow radius (m)** med **Orbit speed (m/s)**.
- **Side to side — sweeps left ↔ right** – ljudet sveper fram och tillbaka från öra till öra med **Sweep speed (m/s)**.

## Triggered – stig som startar när du kommer {#triggered}

Som **Path**, men ljudet väntar vid stigens första hörn tills besökaren kommer inom **Trigger radius (m)**. Då ger det sig av längs stigen i **Speed (m/s)**. Triggerradien är också ljudets hörbara radie. Passar för saker som ska hända *när* besökaren kommer: en kanonkula, en förbipasserande cyklist, en guide som börjar gå när besökaren dyker upp.

## Välja rätt typ {#valja}

- Ska ljudet stå kvar på en plats? **Static**.
- Ska det röra sig hela tiden, oavsett besökaren? **Circling** (runt något) eller **Path** (längs en väg).
- Ska det reagera på besökaren? **Follow** (följer efter) eller **Triggered** (sätter i gång).
- Ska någon guida besökaren mellan flera stopp? **Path** med stopp och **Wait for the listener**.

Typen kan inte bytas när punkten väl är skapad. Skapa en ny punkt i stället och ta bort den gamla.
