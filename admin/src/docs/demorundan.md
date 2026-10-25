# Demorundan: Kalmar i lurarna

**Kalmar i lurarna — en demorunda** är en ljudvandring från Kalmar Turistcenter genom Kvarnholmen till Kalmar slott, cirka 2,3 km och 40 minuter. Den är gjord för att visa vad AudioWorld kan, och den förklarar sig själv: guiden Lova berättar om varje möjlighet precis när besökaren hör den, och historiska Kalmarfigurer visar den.

Öppna rundan i rullistan i toppraden och klicka på punkterna i listan, så ser du exakt hur varje sak är inställd. Varje punkts fakta börjar med **KONCEPT:** följt av vad punkten visar.

> [!TIP]
> Gå rundan på riktigt: starta vid Kalmar Turistcenter på Ölandskajen, ta på dig hörlurarna och följ den gula pilen. Vill du prova vid datorn, öppna rundans länk med `?sim=1` på slutet och klicka på kartan för att gå (se [Prova i datorn](#help/koncept/simulering)).

## Stationerna {#stationer}

| Plats | Punkt | Typ | Vad den visar |
|---|---|---|---|
| Turistcenter | Välkommen | Static | Ljudpunkt, hörbar radie, riktning, radarn och nästa-pilen. Engelsk version under **Narration languages**. |
| Gästhamnen | Måsarna över gästhamnen | Circling | Ett cirklande ljud, 12 meter upp. |
| Turistcenter–gästhamnen | Hamnen (zon) | Zon | Akustisk zon med bakgrundsloop (vågskvalp). |
| Ölandskajen | Måsen som vill ha din glass | Follow (Orbit) | Ett följande ljud som cirklar runt huvudet. |
| Jordbroporten | Jordbroporten | Static | Guiden förklarar följande ljud och dess lägen. |
| Stortorget | Domkyrkans klockor | Static | Höjd (35 m) och slinga med paus (**Pause before looping (s)** 45). |
| Stortorget | Stortorget | Static | Guiden förklarar höjd, riktat ljud och flaggor. |
| Stortorget | Rådmannen | Static | Riktat ljud (**Directional**, vänd mot torget). Sätter flaggan `RADMANNEN`. |
| Storgatan–Västerport | Stadsvakten | Path | Väg med fyra stopp som väntar in besökaren (**Wait for the listener**), visar riktning och avstånd, kräver `RADMANNEN` och försvinner från skärmen när den gått klart. |
| Västerport | Västerport (zon) | Zon | Tunnelklang. Ljud inne i zonen hörs dämpade utifrån. |
| Västerport | Portvakten | Static | Skrämselljud (**Jumpscare trigger radius** 7 m) och dold punkt (**Hidden**). |
| Bron väster om porten | Efter porten | Static | Guiden förklarar zonen, skrämselljudet, det dolda ljudet och vägen med stopp. |
| Stranden mot parken | Hunden på stranden | Follow (Chase) | Ett jagande ljud som ger upp efter 18 meter. |
| Stadsparken, norra entrén | Stadsparken | Static | Två nästa-ljud (två pilar) och ett vägskäl. |
| Stadsparken, västra stigen | Drottningens väg | Static | Exklusiv grupp `parkval`. Sätter `DROTTNINGEN`. |
| Stadsparken, östra stigen | Källarmästarens väg | Static | Exklusiv grupp `parkval`. Sätter `KALLAREN`. |
| Västra stigen | Drottning Margareta | Static | Kräver `DROTTNINGEN`. Berättar om Kalmarunionen 1397. |
| Östra stigen | Källarmästaren | Static | Kräver `KALLAREN`. Berättar om slottets fester och kanoner. |
| Parkens södra udde | Stå still | Static | Guiden ber besökaren stå still. Sätter `SLOTTSBRON`, som laddar kanonkulan. |
| Parkens södra udde | Koltrasten | Static | Hörs först efter 5 sekunders stillhet (**Reveal after standing still**) och tystnar vid rörelse (**Flees on movement**). |
| Slottsfjärden | Kanonkulan | Triggered | Utlöst väg som avfyras när besökaren kommer ut på bron, flyger 15 m upp med dopplereffekt och försvinner när den landat. Kräver `SLOTTSBRON`. |
| Slottsholmen | Kalmar slott | Static | Guiden förklarar kanonkulan. Pekar mot båda avslutningarna. |
| Slottsholmen | Drottningen / Källarmästaren vid slottet | Static | Bara den som hör till besökarens val hörs (flaggor). |
| Slottsholmen | Slutet | Static | Sammanfattning. Engelsk version under **Narration languages**. |
| Slottsfjärden | Kalmar Nyckel | Path (slinga) | Gemensam klocka (**Timing: Global**): alla hör skeppet på samma plats samtidigt. |

## Så hänger den ihop {#flode}

- Varje punkt pekar ut nästa med **Next sound(s)**, så besökarens pil leder hela vägen. På admin-kartan syns kedjan som streckade pilar.
- Guidens punkter är **Play once**, så de upprepas inte om man går förbi igen.
- Stadsvakten vaknar först när besökaren har hört rådmannen, och kanonkulan laddas först vid den södra udden. Så hörs de i rätt ordning även om någon genar.
- Vägvalet i parken låser den andra vägen för resten av rundan, ända fram till avslutningen vid slottet.

## Byggd med skript {#skript}

Rundan är byggd som en fil som importeras i admin (**⚙️ Settings** → **⭱ Import**). Manus, ljudeffekter, geometri och zoner finns i projektets `scripts/kalmar-demo/`, och rösterna och ljuden genereras med ElevenLabs. Du kan lika gärna bygga en liknande runda direkt i admin. Allt rundan gör går att ställa in med knapparna som beskrivs i den här hjälpen.

Fakta i berättelserna kommer från svenska Wikipedia. Lova, rådmannen, stadsvakten, portvakten och källarmästaren är påhittade.
