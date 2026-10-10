# Bakgrundsmusik — "Allhelgonanatt på Svinö" (Suno)

Instrumental bädd som spelas i hela Svinö-zonen under röster och effekter. Skapa i Sunos
webbgränssnitt (Custom, Instrumental på), ladda ner mp3:n och spara den som
`scripts/svino-halloween/audio/music.mp3`, kör sedan `render.mjs` och `build.mjs` igen.
Utan musikfilen används skogsljudet (`forest`) som bädd i stället.

## Style (300 tecken)

```
Instrumental Nordic folk horror score, no vocals. Eerie music box melody over detuned upright piano, droning nyckelharpa, low pulsing cello ostinato, ticking clock percussion and soft frame drums. Minor key, steady 84 BPM pulse from the first bar, no intro. Dark, tense, haunting, dry and very close.
```

## Struktur (Lyrics-fältet)

Inget `[Intro]` — pulsen ska vara där från första takten.

```
[Instrumental]
[Music Box Theme]
[Cello Pulse, Ticking Clock]

[Verse]
[Detuned Piano, Nyckelharpa Drone]

[Instrumental Break]
[Frame Drums Enter, Low Strings]

[Verse]
[Music Box Theme, Darker]

[Bridge]
[Sparse, Only Ticking And Cello]

[Instrumental Break]
[Full Theme, Nyckelharpa Lead]

[Outro]
[Music Box Alone, Clock Stops]
```
