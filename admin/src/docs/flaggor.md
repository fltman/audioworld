# Styra berättelsen

Utan styrning hör besökaren varje ljud på vägen, i den ordning besökaren råkar gå förbi dem. Med flaggor, vägval och nästa ljud bestämmer du ordningen, låser upp kapitel och leder besökaren vidare.

## Flaggor {#flaggor}

En **flagga** är ett ord du hittar på, till exempel `SLOTTET` eller `KAPITEL-2`. Den sätts när besökaren har hört en punkt och gäller sedan resten av rundan.

- **Sets flags when visited** – flaggor som sätts när besökaren hört den här punkten (kommit inom dess hörbara radie). Flera skiljs med komma: `SLOTTET, NYCKEL`.
- **Requires flags to activate** – punkten är tyst *och* osynlig tills alla de här flaggorna är satta.

Exempel: punkten "Slottsvakten" sätter `VAKTEN`. Punkten "Den hemliga gången" kräver `VAKTEN`. Besökaren som går direkt till gången hör ingenting där – först efter att ha träffat vakten öppnas den.

> [!TIP]
> Skriv flaggor med versaler och utan mellanslag, så är de lätta att känna igen och stava likadant överallt. Stavningen måste vara exakt densamma i båda fälten.

## Vägval: Exclusive group {#vagval}

**Exclusive group (crossroads)** gör ett vägval. Ge två eller flera punkter samma gruppnamn, till exempel `val-1`, och låt var och en sätta sin egen flagga:

- "Mot hamnen" i gruppen `val-1` sätter `HAMNEN`.
- "Mot torget" i gruppen `val-1` sätter `TORGET`.

Den punkt i gruppen som besökaren når först vinner: dess flaggor sätts, och de andra punkternas flaggor låses för resten av rundan. Allt som kräver `TORGET` förblir tyst för den som valde hamnen. För att ett snabbt GPS-hopp inte ska avgöra valet måste besökaren höra punkten en dryg sekund innan valet låses.

## Next sound(s) {#nasta-ljud}

**Next sound(s)** i punktredigeraren pekar ut vart besökaren ska gå när punkten har hörts.

- Välj en punkt i rullistan **+ Choose the sound to head for next…**. Den läggs i listan ovanför. **×** tar bort den.
- Välj fler med **+ Add another way…** för att ge besökaren ett val.

På admin-kartan syns kopplingen som en ljuslila prickad linje med en pilspets. Hos besökaren pekar radarn – när punkten hörts – mot nästa ljud med en gul pil märkt "Next: …", och kartan markerar det med en streckad linje från där besökaren står. När nästa ljud har hörts (eller om inget är valt) pekar radarn mot de närmaste ljuden igen.

Dolda punkter går att välja, men får ingen pil – de syns ju inte (flight check varnar för det).

## Hidden {#dold}

**Hidden on the listener's screen — heard, not seen** döljer punkten i besökarens radar och karta men låter den höras. Använd det för miljöljud, överraskningar och ljud som inte är något "mål". Punkten märks med **hidden** i punktlistan.

## Sådant som kontrolleras före publicering {#kontroll}

Flight check i [publiceringsraden](#help/publicera/flight-check) varnar om:

- en punkt kräver en flagga som ingen nåbar punkt sätter – då kan den aldrig höras,
- en punkt kräver två flaggor från samma vägval – de kan aldrig båda bli satta,
- en punkt pekar ut ett nästa ljud som inte finns längre, eller som är dolt.

## Prova logiken {#prova}

Logiken gäller även i [provlyssningen](#help/provlyssna). **Restart** i provlyssningspanelen nollställer alla flaggor och val, så att du kan prova en annan väg.
