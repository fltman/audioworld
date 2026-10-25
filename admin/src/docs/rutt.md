# Planerad rutt

Den planerade rutten är vägen du vill att besökaren ska gå, från start till mål. Den används på flera ställen:

- Den ritas ut (streckad) på besökarens karta, så att besökaren hittar.
- Startsidans karta visar den, och rundans längd och ungefärliga tid räknas fram ur den.
- Simuleringen i lyssnarappen (`?sim=1`) börjar vid rutten början.
- [AI-assistenten](#help/ai-assistent) följer den när den föreslår var punkter ska ligga.

Rutten styr inte ljuden – en besökare som går en annan väg hör det som finns där. Öppna verktyget med **〰 Route** under **Tools**.

## Rita rutten {#rita}

1. Klicka på **Draw the route**.
2. Klicka på kartan längs vägen, hörn för hörn. Raden visar antalet: "5 corners · click the map to trace the route, double-click to finish".
3. **Undo** tar bort det senaste hörnet.
4. Klicka på **Finish** eller dubbelklicka på kartan. Det krävs minst två hörn. **Cancel** avbryter utan att ändra något.

Rutten sparas direkt när du avslutar.

## Ändra rutten {#andra}

När rutten finns visar panelen dess längd och tid, till exempel "1.8 km · about 23 min at walking pace" (i lugn gångtakt).

- **Dra hörnen** på kartan (de syns som handtag medan verktyget är öppet). Varje flytt sparas direkt.
- **Continue drawing** – fortsätt rita från rutten slut.
- **Redraw** – rita om från början. Den gamla rutten gäller tills du avslutar den nya.
- **Delete route** – byter mot **Yes, delete** och **Cancel**. Tar bort rutten.

På kartan syns rutten som en gul-orange streckad linje från en fylld startprick till en ring vid målet.

> [!TIP]
> Rita rutten tidigt. Då ser du var punkterna ska ligga, och AI-assistenten kan föreslå punkter längs den.
