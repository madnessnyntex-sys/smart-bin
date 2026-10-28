# Bridge

A small Node program that sits between the Arduino and the backend. The Arduino can't use the internet by itself,
so this program (running on the computer the Arduino is plugged into) passes messages along.

```
Arduino --DETECT--> bridge --POST /api/device/detections--> backend
Arduino <--DISPENSE,20-- bridge <------- { action, rice_grams } -------
```

1. The Arduino's sensor sees an item and sends `DETECT`.
2. The bridge works out the item (the terminal menu for now, your camera model later).
3. It sends the item to the backend with the bin's key.
4. The backend decides and takes the rice out of the hopper count. The bridge turns the answer into
   `DISPENSE,<grams>`, `REJECT` or `OUT_OF_STOCK` and sends it to the Arduino.
5. If anything goes wrong, it sends `ERROR` and the Arduino gives no rice.

## Run it

You need Node 20.6 or newer. Start the backend first, then:

```
cd bridge
cp .env.example .env     # then edit .env: set SERIAL_PORT to your Arduino's port, e.g. COM3
npm install
npm start
```

- **Which port?** In the Arduino IDE it's under Tools > Port. On Windows it also shows in Device Manager under "Ports (COM & LPT)".
  If the bridge can't open the port it prints the ports it can see.
- **Close the Arduino IDE's Serial Monitor.** Only one program can use the port at a time.
- `DEVICE_API_KEY` is the bin's key. The dev bin from `backend/schema.sql` uses `dev-bin-key-change-me`.
- Opening the port restarts the Arduino. That is normal, wait for "Arduino is ready."

When an item is detected the terminal shows a numbered list. Type the number of what you dropped and press Enter.
The Arduino waits 15 seconds for the answer (`REPLY_TIMEOUT_MS` in the sketch), so don't take too long.
Every 30 seconds the bridge also tells the backend the bin is alive, which keeps the dashboard's "Online" light on.

## Adding your camera model

Open `classify.js` and fill in the `classify()` function so it returns `{ item: 'Water bottle', confidence: 0.93 }`.
As long as it returns `null`, the bridge uses the terminal menu. The `item` should be one of the names in
`backend/schema.sql`, otherwise the backend saves it as "Unrecognized" and rejects it.
If you want to remove the 15 second wait once the camera is in, lower `REPLY_TIMEOUT_MS` in the sketch (5000 is plenty).

## When things go wrong

| What happened | What the bridge does |
|---|---|
| Backend not running, key wrong, or backend returns an error | Sends `ERROR`: no rice, the item is pushed out |
| Backend takes longer than 8 seconds | Sends `ERROR`. It does **not** try again, because the first try may have worked and a second would count the rice twice. Check the dashboard |
| The Arduino gives up first (`TIMEOUT`) while you were still choosing | Cancels the menu and sends nothing |
| The Arduino gives up while the backend was answering | Prints the detection number. The backend counted rice that never came out: delete that detection on the dashboard to put it back |
| Two `DETECT` messages at once | The second is ignored |
| Arduino unplugged | The bridge stops. Plug it back in and run `npm start` again |

## Limits

- The sketch never gives more than 100 g per item (`MAX_RICE_GRAMS`). If you set a bigger reward in `waste_types`, the backend will count more than the bin gives.
- The menu names are a copy of the ones in `backend/schema.sql` (in `menu.js`). If you add an item to the database, add it there too. A test checks they still match.
- The bridge can't be tested with the real serial port without the hardware. The tests run it against a fake backend, and a fake Arduino is just a list of lines.

## Tests

`npm test` needs no Arduino and no backend.
