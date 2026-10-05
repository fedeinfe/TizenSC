# TizenSC

Modulo per [TizenBrew](https://github.com/reisxd/TizenBrew) che trasforma la TV Samsung (Tizen) in un browser
dedicato a un sito a tua scelta, usabile con il telecomando.

## Installazione sulla TV

1. Apri **TizenBrew** sulla TV.
2. Vai in **Module Manager** → **Add GitHub Module**.
3. Scrivi: `fedeinfe/TizenSC` e conferma.
4. Torna alla schermata principale e avvia **TizenSC**.

Al primo avvio ti viene chiesto l'indirizzo del sito: selezionalo, premi **OK** per aprire la tastiera,
scrivi l'indirizzo (es. `https://esempio.com`) e poi scegli **Salva e apri**.
L'indirizzo viene ricordato: dagli avvii successivi il sito si apre da solo dopo 3 secondi
(premi un tasto qualsiasi durante il conto alla rovescia per cambiarlo).

## Comandi del telecomando

| Tasto | Azione |
|---|---|
| Frecce | Spostano la selezione (riquadro rosso) tra link e pulsanti; scorrono la pagina se non c'è altro |
| OK | Apre/clicca l'elemento selezionato; sulla pagina del video entra nel player |
| Indietro | Pagina precedente · esce dallo schermo intero · esce dal player · dalla prima pagina torna al menu |
| Play/Pausa, Stop, Avanti/Indietro veloce | Controllano il video (±10 s) |
| Rosso | Menu TizenSC (cambia indirizzo) |
| Verde | Ricarica la pagina |
| Giallo | Torna in cima alla pagina |
| Blu | Cambia lo zoom: 100% → 125% → 150% → 175% → 200% (predefinito 150%, viene ricordato) |

## Guardare un video

Sulla pagina del video premi **OK** per entrare nel player. Compare una barra TizenSC con stato, tempo e
avanzamento (resta visibile in pausa, altrimenti sparisce dopo qualche secondo):

| Tasto | Azione |
|---|---|
| ← / → | Indietro / avanti di 10 s; tenendo premuto si scorre più veloce (30 s, poi 60 s) |
| OK | Pausa / riprendi |
| ↑ / ↓ | Selezionano i pulsanti del player (sottotitoli, qualità, episodi…); ← → si spostano tra i pulsanti |
| Indietro | Dai pulsanti torna al video; dal video esce dal player |

Le pagine del sito sono ingrandite (zoom 150%) per essere leggibili dal divano; a schermo intero lo zoom si disattiva.

## Blocco pubblicità e pop-up

Attivo di default. Blocca:

- **pop-up e pop-under**: le finestre che il sito prova ad aprire a ogni clic vengono bloccate (anche i trucchi
  per aggirare il blocco, come i link creati e cliccati di nascosto o gli iframe vuoti);
- **redirect pubblicitari**: se un clic prova a portarti su un altro sito, la navigazione viene annullata;
  sulle TV più vecchie la pagina pubblicitaria viene chiusa subito e si torna al sito;
- **script, banner e iframe** dei principali circuiti pubblicitari;
- **livelli invisibili** stesi sopra la pagina (o sopra il player) che catturano i clic.

Quando qualcosa viene bloccato compare un avviso in alto a destra ("Pop-up bloccato", "Pubblicità bloccata").
I link verso altri siti che scegli tu con **OK** vengono aperti normalmente.

Se il sito smette di funzionare bene, il blocco si può disattivare dal menu (tasto **Rosso**) →
**Blocco pubblicità e pop-up**, poi **Salva e apri**.

I link "nuova finestra" del sito vengono aperti nella stessa finestra, perché sulla TV non esistono schede.

## Cambiare l'indirizzo predefinito

Se il sito cambia dominio puoi:

- sulla TV: premi il tasto **Rosso** (o **Indietro** dalla prima pagina) e modifica l'indirizzo; oppure
- su GitHub: modifica `config.json` e scrivi il nuovo indirizzo in `"url"`. Poi sulla TV, nel menu, scegli
  **Usa l'indirizzo predefinito**. (jsDelivr può impiegare fino a qualche ora ad aggiornare la copia;
  per forzarlo apri `https://purge.jsdelivr.net/gh/fedeinfe/TizenSC/config.json`.)

## Struttura

- `package.json` – descrizione del modulo per TizenBrew (`packageType: "mods"`)
- `launcher/index.html` – schermata iniziale (avvio automatico / impostazioni)
- `dist/userScript.js` – script iniettato in ogni pagina: navigazione col telecomando, tasti media, blocco pubblicità e pop-up
- `config.json` – indirizzo predefinito

Dopo aver modificato i file su GitHub, svuota la cache di jsDelivr per vederli subito sulla TV:
`https://purge.jsdelivr.net/gh/fedeinfe/TizenSC/package.json` (e lo stesso per gli altri file modificati).
