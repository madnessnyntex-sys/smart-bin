// Smart Bin: Arduino Uno sketch.
//
// What it does, in order:
//   1. The HC-SR04 ultrasonic sensor watches for an item dropped into the bin.
//   2. When an item stays in front of the sensor for half a second, we send "DETECT"
//      over the USB cable. The bridge program on the computer works out what the item
//      is, asks the backend, and sends back one line telling us what to do:
//        DISPENSE,20   sort the item as recyclable and give 20 grams of rice
//        REJECT        push the item to the reject side, no rice
//        OUT_OF_STOCK  recyclable, but the rice hopper is empty: sort it, no rice
//        ERROR         the computer had a problem: push the item out, no rice
//   3. We do it, beep, flash the LED, and send "DONE".
//
// Safety rule: rice is ONLY given when the computer says DISPENSE. If no reply comes
// within 5 seconds we treat it as an error and give nothing.
//
// Serial settings: 9600 baud. Every message is one line that ends with a newline.
// Lines we send: READY (after start-up), DETECT, DONE, TIMEOUT.

#include <Servo.h>  // comes with the Arduino IDE

// ---------- pins ----------
const byte TRIG_PIN = 9;         // HC-SR04 trigger
const byte ECHO_PIN = 10;        // HC-SR04 echo
const byte SORT_SERVO_PIN = 5;   // SG90: the flap that sorts items
const byte RICE_SERVO_PIN = 6;   // MG996R: the gate that lets rice out
const byte BUZZER_PIN = 7;
const byte LED_PIN = 8;          // external LED, with a 220 ohm resistor

// ---------- sensor settings (tune these for your box) ----------
const unsigned int DETECT_CM = 15;        // something closer than this counts as "an item is here"
const unsigned int MIN_CM = 2;            // the sensor can't read closer than about 2 cm, so ignore less
const unsigned long SAMPLE_MS = 60;       // time between readings (the HC-SR04 needs about 60 ms)
const unsigned long STABLE_MS = 500;      // the item must stay this long before we send DETECT
const unsigned long CLEAR_MS = 1000;      // after a cycle the bin must be empty this long before the next one
const unsigned long REPLY_TIMEOUT_MS = 5000;  // how long we wait for the computer's answer
const bool PRINT_DISTANCE = false;        // set to true to print "DIST <cm>" lines while setting up the sensor

// ---------- sorting flap (SG90), angles in degrees ----------
const byte SORT_HOLD = 90;      // level: the item rests on the flap while we wait for the answer
const byte SORT_ACCEPT = 30;    // tilted one way: item slides into the recyclables side
const byte SORT_REJECT = 150;   // tilted the other way: item slides into the reject side
const unsigned int SORT_MOVE_MS = 600;  // time for the flap to swing and the item to slide off

// ---------- rice gate (MG996R) ----------
const byte GATE_CLOSED = 0;
const byte GATE_OPEN = 90;
const unsigned int GATE_MOVE_MS = 400;  // time for the gate to finish moving
// How long the gate stays open for each gram of rice. This is a GUESS. Measure it:
// dispense 20 g, weigh what came out, then change this number until it matches.
const unsigned int MS_PER_GRAM = 100;
const long MAX_RICE_GRAMS = 100;        // never give more than this in one go, even if asked

Servo sortServo;
Servo riceServo;

// The bin is always in one of these three states.
enum State {
  IDLE,        // waiting for an item
  WAIT_REPLY,  // we sent DETECT and are waiting for the computer's answer
  WAIT_CLEAR   // cycle finished, waiting for the bin to be empty again
};
State state = IDLE;

unsigned long lastSample = 0;   // when we last read the sensor
bool itemSeen = false;          // is an item in front of the sensor right now?
unsigned long itemSeenSince = 0;
bool binEmpty = false;          // used in WAIT_CLEAR
unsigned long binEmptySince = 0;
unsigned long askedAt = 0;      // when we sent DETECT

// the line we are receiving from the computer
char line[24];
byte lineLen = 0;
bool lineTooLong = false;

// ---------- sensor ----------

// Returns the distance in cm, or 0 if no echo came back (nothing in range).
unsigned int readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);   // a 10 microsecond pulse makes the sensor send a sound
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long echoUs = pulseIn(ECHO_PIN, HIGH, 30000UL);  // gives up after 30 ms
  return (unsigned int)(echoUs / 58UL);  // sound needs about 58 microseconds per cm there and back
}

// ---------- beeps and light ----------

// Flashes the LED and beeps together. "times" beeps, each "onMs" long with "offMs" between.
void blinkAndBeep(byte times, unsigned int onMs, unsigned int offMs, unsigned int pitchHz) {
  for (byte i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, pitchHz);
    delay(onMs);
    noTone(BUZZER_PIN);
    digitalWrite(LED_PIN, LOW);
    delay(offMs);
  }
}

// ---------- moving parts ----------
// While these run (a few seconds at most) there is nothing else for the bin to do,
// so plain delay() keeps the code easy to follow.

// Swings the flap to one side so the item slides off, then levels it again.
void sortItem(byte side) {
  sortServo.write(side);
  delay(SORT_MOVE_MS);
  sortServo.write(SORT_HOLD);
  delay(SORT_MOVE_MS);
}

// Opens the rice gate for long enough to let out about "grams" of rice.
void dispenseRice(long grams) {
  if (grams > MAX_RICE_GRAMS) grams = MAX_RICE_GRAMS;
  riceServo.write(GATE_OPEN);
  delay(grams * MS_PER_GRAM);
  riceServo.write(GATE_CLOSED);
  delay(GATE_MOVE_MS);
}

// What to do for each answer from the computer.
void acceptAndDispense(long grams) {
  blinkAndBeep(2, 100, 100, 1800);   // two short high beeps: accepted
  sortItem(SORT_ACCEPT);
  dispenseRice(grams);
}

void rejectItem() {
  blinkAndBeep(1, 600, 0, 400);      // one long low beep: rejected
  sortItem(SORT_REJECT);
}

void outOfStock() {
  blinkAndBeep(3, 200, 150, 900);    // three medium beeps: recyclable, but no rice left
  sortItem(SORT_ACCEPT);             // the item is still recyclable, so it goes to the recyclables side
}

void failSafe() {
  blinkAndBeep(4, 100, 100, 300);    // four quick low beeps: something went wrong
  sortItem(SORT_REJECT);             // no rice, and the item is pushed out
}

// ---------- the cycle ----------

// Sends DETECT and starts waiting for the answer.
void askComputer() {
  while (Serial.available()) Serial.read();  // throw away any old, unread messages
  lineLen = 0;
  lineTooLong = false;
  Serial.println(F("DETECT"));
  digitalWrite(LED_PIN, HIGH);               // LED stays on while we wait
  askedAt = millis();
  state = WAIT_REPLY;
}

// Called after the item has been dealt with. Waits for the bin to empty before the next item.
void endCycle() {
  digitalWrite(LED_PIN, LOW);
  Serial.println(F("DONE"));
  itemSeen = false;
  binEmpty = false;
  state = WAIT_CLEAR;
}

// Called for every complete line from the computer while we are waiting for its answer.
void handleCommand(const char* cmd) {
  if (strcmp(cmd, "REJECT") == 0) {
    rejectItem();
  } else if (strcmp(cmd, "OUT_OF_STOCK") == 0) {
    outOfStock();
  } else if (strcmp(cmd, "ERROR") == 0) {
    failSafe();
  } else if (strncmp(cmd, "DISPENSE,", 9) == 0) {
    long grams = atol(cmd + 9);      // the number after the comma
    if (grams >= 1) {
      acceptAndDispense(grams);
    } else {
      failSafe();                    // "DISPENSE,0" or garbage: don't open the gate
    }
  } else {
    return;                          // not something we know, so keep waiting (the timeout still protects us)
  }
  endCycle();
}

// Collects characters until a full line has arrived. Returns true when "line" holds one.
bool readLine() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      bool good = !lineTooLong;
      line[lineLen] = '\0';
      lineLen = 0;
      lineTooLong = false;
      if (good) return true;         // a too-long line is junk, so it is dropped
      continue;
    }
    if (lineLen < sizeof(line) - 1) {
      line[lineLen++] = c;
    } else {
      lineTooLong = true;
    }
  }
  return false;
}

// ---------- watching the sensor ----------

// IDLE: has an item been sitting in front of the sensor long enough?
void watchForItem(bool present) {
  if (!present) {
    itemSeen = false;                // it went away (or it was a false reading), start over
    return;
  }
  if (!itemSeen) {
    itemSeen = true;
    itemSeenSince = millis();
  } else if (millis() - itemSeenSince >= STABLE_MS) {
    askComputer();
  }
}

// WAIT_CLEAR: has the bin been empty long enough to take the next item?
void watchForEmpty(bool present) {
  if (present) {
    binEmpty = false;
    return;
  }
  if (!binEmpty) {
    binEmpty = true;
    binEmptySince = millis();
  } else if (millis() - binEmptySince >= CLEAR_MS) {
    itemSeen = false;
    state = IDLE;
  }
}

// ---------- Arduino entry points ----------

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  // set the starting angle first, then attach, so the servos don't jump on power-up
  sortServo.write(SORT_HOLD);
  sortServo.attach(SORT_SERVO_PIN);
  riceServo.write(GATE_CLOSED);
  riceServo.attach(RICE_SERVO_PIN);

  Serial.begin(9600);
  blinkAndBeep(1, 150, 0, 1500);     // one short beep: ready
  Serial.println(F("READY"));
}

void loop() {
  // read the sensor every SAMPLE_MS (not while waiting for the computer)
  if (state != WAIT_REPLY && millis() - lastSample >= SAMPLE_MS) {
    lastSample = millis();
    unsigned int cm = readDistanceCm();
    if (PRINT_DISTANCE) {
      Serial.print(F("DIST "));
      Serial.println(cm);
    }
    bool present = (cm >= MIN_CM && cm <= DETECT_CM);
    if (state == IDLE) {
      watchForItem(present);
    } else {
      watchForEmpty(present);
    }
  }

  // listen to the computer. Lines that arrive when we are not waiting are ignored.
  if (readLine() && state == WAIT_REPLY) {
    handleCommand(line);
  }

  // no answer in time: give nothing and push the item out
  if (state == WAIT_REPLY && millis() - askedAt >= REPLY_TIMEOUT_MS) {
    Serial.println(F("TIMEOUT"));
    failSafe();
    endCycle();
  }
}
