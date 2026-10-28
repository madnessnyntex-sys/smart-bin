# Arduino sketch

`smart_bin/smart_bin.ino` runs on an **Arduino Uno R3**. It watches the HC-SR04 for an item,
asks the computer what to do over the USB cable, then moves the sorting flap and the rice gate.

To upload it: open `smart_bin/smart_bin.ino` in the Arduino IDE (the folder name must match the file name),
choose **Tools > Board > Arduino Uno** and the right **Port**, press **Verify**, then **Upload**.
No extra libraries are needed, `Servo` comes with the IDE.

## Wiring

| Part | Part pin | Connect to |
|---|---|---|
| HC-SR04 | VCC | Arduino 5V |
| | Trig | Arduino **D9** |
| | Echo | Arduino **D10** |
| | GND | Arduino GND |
| SG90 (sorting flap) | Signal (orange or yellow) | Arduino **D5** |
| | Red | 5V servo supply (see power note) |
| | Brown or black | GND (shared) |
| MG996R (rice gate) | Signal (orange or yellow) | Arduino **D6** |
| | Red | **Its own 5-6V supply, at least 2A** |
| | Brown or black | That supply's GND **and** Arduino GND (shared ground) |
| Buzzer | + | Arduino **D7** |
| | - | Arduino GND |
| LED | Long leg (anode) | Arduino **D8** through a **220 ohm resistor** |
| | Short leg | Arduino GND |

**Power note.** The MG996R can pull about 2A when it pushes against rice, far more than the Uno's 5V pin
or USB can give. Power it from its own supply of at least 2A, and join that supply's GND to the Arduino GND,
otherwise the signal wire has no common reference and the servo jitters or ignores commands.
If the Arduino keeps resetting when the gate moves, the supply is too weak.
Never power the MG996R from the Arduino's 5V pin.
The easiest and safest way to power the SG90 is from the same external supply (use a supply rated 3A or more
for both). A 470-1000 uF capacitor across the servo supply, close to the servos, smooths out the spikes.

## Messages over USB (9600 baud, one line each)

| Direction | Line | Meaning |
|---|---|---|
| Arduino to computer | `READY` | Started up |
| | `DETECT` | An item has been in front of the sensor for 0.5 s |
| | `DONE` | Finished dealing with the item |
| | `TIMEOUT` | No answer came within 5 s (the item is pushed out, no rice) |
| Computer to Arduino | `DISPENSE,20` | Sort as recyclable and give 20 g of rice |
| | `REJECT` | Push the item to the reject side, no rice |
| | `OUT_OF_STOCK` | Recyclable, but the hopper is empty: sort it as recyclable, no rice |
| | `ERROR` | Something went wrong on the computer: push the item out, no rice |

Rice is only ever given for `DISPENSE,<grams>`. Anything else, or no answer, gives none.
The sketch gives at most `MAX_RICE_GRAMS` (100 g) per item, however big the number is.

## Try it without the backend

1. Upload the sketch and open **Serial Monitor**. Set it to **9600 baud** and **Newline** at the end of each line.
2. You should see `READY`. Hold your hand about 5-10 cm from the sensor for a second: `DETECT` appears and the LED stays on.
3. Within 5 seconds type `DISPENSE,20` and press Enter. The flap tilts, the gate opens, then both return, and you see `DONE`.
4. Try again and type `REJECT`, then `OUT_OF_STOCK`, then `ERROR`. Try again and type nothing: after 5 s you see `TIMEOUT`.
5. Take your hand away for a second before the next try, the bin waits for it to be empty.

Beeps: 1 long low = rejected. 2 short high = accepted. 3 medium = out of rice. 4 quick low = error or timeout.

## Things you must tune

All of these are constants at the top of the sketch.

- **Sensor distance (`DETECT_CM`).** Set `PRINT_DISTANCE` to `true`, open Serial Monitor, and drop an item in. Pick a value that
  is a little more than the item's distance and less than the distance to the empty bin. Set it back to `false` afterwards
  (the extra `DIST` lines are harmless but noisy).
- **Flap angles (`SORT_HOLD`, `SORT_ACCEPT`, `SORT_REJECT`).** The values 90, 30 and 150 are starting guesses. Adjust them to your box.
- **Gate angles (`GATE_CLOSED`, `GATE_OPEN`).** Same: 0 and 90 are guesses.
- **Rice per gram (`MS_PER_GRAM`).** The gate stays open for `grams x MS_PER_GRAM` milliseconds. Send `DISPENSE,20`,
  weigh the rice that came out, and change the number until it matches. Rice amounts will only be approximate: how fast
  rice flows depends on the rice, how full the hopper is, and the gate opening.
