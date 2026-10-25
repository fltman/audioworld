# Scout

Med scouting samlar du platser ute i verkligheten med mobilen – en anteckning, foton och en röstanteckning per plats – och gör dem sedan till ljudpunkter i admin.

## Samla platser i fält {#falt}

1. Öppna lyssnarappens adress med `/?scout` sist på mobilen (till exempel `https://…/?scout`). Sidan heter **Field scout**.
2. Logga in med samma konto som i admin.
3. Skapa ett **set** – en samling platser – med ett namn, till exempel "Kvarnholmen vår", och klicka på **+ Create**.
4. Gå ut. Vid varje intressant plats: tryck på **Mark this spot**. Skriv en anteckning ("Note about this spot…"), ta foton och spela gärna in en röstanteckning. GPS-noggrannheten visas (till exempel ±6 m).
5. Tryck på **Save waypoint**. Platsen hamnar på kartan i setet.

Plats och mikrofon kräver en säker anslutning (https).

## Visa setet i admin {#lager}

Klicka på **📍 Scout** under **Tools**. I panelen **Scout layer** väljer du ett set i rullistan (antalet platser står inom parentes). **None** döljer lagret.

Platserna visas som numrerade nålar på kartan. Klicka på en nål för anteckningen, röstanteckningen och noggrannheten. Använd dem som stöd när du placerar egna punkter, eller gör om dem direkt med AI nedan.

## Gör platser till ljudpunkter {#poi}

Under **POI → audio points (AI)** listas setets platser med anteckning och foton. AI läser anteckningen och tittar på fotona, skriver ett förslag på berättelse, och en röst läser in det. Punkten placeras på platsen som en **Static**-punkt med 30 meters radie.

- **Narration voice** – rösten som läser in.

### En plats i taget {#en-i-taget}

1. Klicka på **✨ Interpret** under platsen. AI skriver ett namn och en berättelse ("✨ Reading…").
2. Ändra namnet och texten om du vill.
3. Klicka på **Generate & place**. Rösten läser in texten och punkten skapas ("Placing…"). Platsen märks **✓ placed**.
4. **Re-interpret** skriver ett nytt förslag.

### Flera på en gång {#flera}

- Kryssa i platserna, eller **Select all**. **Clear** avmarkerar.
- **Convert n → points** – tolkar, läser in och placerar alla valda.
- **As a route** – samma sak, men ordnade som en promenad från den första. Kräver minst två.

Det står "Uses OpenRouter + ElevenLabs credits." när något är valt – varje plats kostar en AI-tolkning och en inläsning. Platser som redan tolkats tolkas inte om.
