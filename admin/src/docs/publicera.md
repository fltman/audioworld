# Publicera och dela

Allt du bygger i admin är ett utkast. Besökarna hör den version du senast **publicerade**. Publiceringsraden överst i vänsterspalten visar läget och har knapparna för att publicera och dela.

## Status {#status}

Till vänster i raden står en av tre etiketter:

| Etikett | Betyder |
|---|---|
| **Never published** | Rundan har aldrig publicerats. Den syns inte i lyssnarappens lista. |
| **Unpublished changes** | Rundan är publicerad, men du har ändrat något sedan dess. Besökarna hör fortfarande den gamla versionen. |
| **Published** | Det besökarna hör är det du ser. |

Efter etiketten står när rundan senast publicerades.

Ändringar i punkter, rundans text och inställningar, rutten och sparade zoner räknas som ändringar.

## Publish och Publish changes {#publicera}

- **Publish** (första gången) eller **Publish changes** (därefter) skickar ut den nuvarande versionen till besökarna. Under tiden står det **Publishing…**.
- Knappen är grå när det inte finns något nytt att publicera, och när flight check hittat fel – för muspekaren över den för att se "Fix the flight-check errors first".

Besökare som redan går rundan fortsätter med den version de laddade. Nya besökare får den nya.

## Flight check {#flight-check}

Under raden listar admin hela tiden problem i rundan. **Röda** rader är fel och stoppar publiceringen. **Gula** rader är varningar – du kan publicera ändå. Gäller raden en viss punkt är den klickbar och öppnar punkten i redigeraren.

| Meddelande | Typ | Betyder och åtgärd |
|---|---|---|
| This course has no audio points yet. | Varning | Rundan är tom. Placera punkter. |
| "*namn*" has no audio URL. | Fel | Punkten saknar ljud. Läs in en berättelse eller ladda upp ett klipp (se [Berättarröst](#help/berattelse)). |
| "*namn*" is a path with fewer than 2 points. | Fel | Stigen har färre än två hörn. Öppna den och klicka på **+ Add points**. |
| "*namn*" requires flag "*X*", which no reachable point sets — it can never trigger. | Fel | Ingen punkt som besökaren kan nå sätter flaggan, så punkten hörs aldrig. Kontrollera stavningen, eller lägg till flaggan i **Sets flags when visited** på rätt punkt. |
| "*namn*" requires "*X*" and "*Y*" from the same exclusive group — they can never both be set. | Fel | Punkten kräver två flaggor från samma vägval, men besökaren kan bara välja en väg. Kräv bara en av dem. |
| "*namn*" stop #*n* has an empty clip URL. | Varning | Ett stopp på stigen har ett tomt klipp. Läs in stoppet eller rensa det. |
| Zone "*namn*" needs at least 3 corners. | Fel | Zonen har för få hörn. Ta bort den och rita om. |
| "*namn*" points to a next sound that no longer exists. | Varning | Punkten pekar ut ett nästa ljud som tagits bort. Öppna punkten och ta bort det med **×** under **Next sound(s)**. |
| "*namn*" points to "*mål*" as next, but it's hidden on the listener's screen — no arrow will show. | Varning | Nästa ljud är dolt, så besökaren får ingen pil dit. Avmarkera **Hidden** på målet eller välj ett annat nästa ljud. |

Se [Styra berättelsen](#help/flaggor) om flaggor och vägval.

## Dela {#dela}

**🔗 Share** visas när rundan har publicerats minst en gång. Den fäller ut delningspanelen (och heter då **Hide share**):

- **Länken** till rundan, i ett fält du kan markera. Den bygger på rundans korta adress, till exempel `…/kalmar-pa-fem-minuter`. **Copy** kopierar den.
- **QR-koden** till samma länk. **Download QR** sparar den som en PNG-bild, färdig för en skylt eller broschyr.
- **Close** fäller ihop panelen.

Samma panel finns under **⚙️ Settings** → **🔗 Share link & QR**. Där kan du också ändra den korta adressen – men gör det innan du trycker QR-koder, eftersom gamla länkar och koder slutar fungera när adressen ändras. Se [Inställningar](#help/installningar/lyssna-och-dela).

## Testa innan du delar {#testa}

1. Öppna länken på din egen mobil (skanna QR-koden).
2. Kontrollera startsidan: bild, text, startplats.
3. Gå rundan med hörlurar, gärna på olika tider på dygnet.
4. Är du hemma kan du gå rundan på datorn med **Try it on this screen** på startsidan.
