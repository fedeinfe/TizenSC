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
| OK | Apre/clicca l'elemento selezionato; sul player entra nel video |
| Indietro | Pagina precedente · esce dallo schermo intero · esce dal player · dalla prima pagina torna al menu |
| Play/Pausa, Stop, Avanti/Indietro veloce | Controllano il video (±10 s) |
| Frecce ←/→ in schermo intero | Riavvolgono/avanzano di 10 s |
| Rosso | Menu TizenSC (cambia indirizzo) |
| Verde | Ricarica la pagina |
| Giallo | Torna in cima alla pagina |
| Blu | Cambia lo zoom: 100% → 125% → 150% → 175% → 200% (predefinito 150%, viene ricordato) |

Le pagine del sito sono ingrandite (zoom 150%) per essere leggibili dal divano; a schermo intero lo zoom si disattiva.

Pop-up e link "nuova finestra" vengono aperti nella stessa finestra (o bloccati), perché sulla TV non esistono schede.

## Cambiare l'indirizzo predefinito

Se il sito cambia dominio puoi:

- sulla TV: premi il tasto **Rosso** (o **Indietro** dalla prima pagina) e modifica l'indirizzo; oppure
- su GitHub: modifica `config.json` e scrivi il nuovo indirizzo in `"url"`. Poi sulla TV, nel menu, scegli
  **Usa l'indirizzo predefinito**. (jsDelivr può impiegare fino a qualche ora ad aggiornare la copia;
  per forzarlo apri `https://purge.jsdelivr.net/gh/fedeinfe/TizenSC/config.json`.)

## Struttura

- `package.json` – descrizione del modulo per TizenBrew (`packageType: "mods"`)
- `launcher/index.html` – schermata iniziale (avvio automatico / impostazioni)
- `dist/userScript.js` – script iniettato in ogni pagina: navigazione col telecomando, tasti media, blocco pop-up
- `config.json` – indirizzo predefinito

Dopo aver modificato i file su GitHub, svuota la cache di jsDelivr per vederli subito sulla TV:
`https://purge.jsdelivr.net/gh/fedeinfe/TizenSC/package.json` (e lo stesso per gli altri file modificati).
