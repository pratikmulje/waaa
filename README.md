# WAAA — Backend Only (no Firebase, no dashboard)

Just the WhatsApp connection. Every incoming message gets:
1. Printed to the terminal
2. Appended to a local `messages.json` file (created automatically next to this README once the first message arrives)

No Firebase, no React, no external services — this proves the WhatsApp piece works completely on its own before we add anything else back in.

## Run it

```bash
npm install
npm start
```

Scan the QR code that prints: WhatsApp → Settings → Linked Devices → Link a Device.

Once you see `[connection] connected to WhatsApp ✅`, have someone message you. You should see:
```
[event] messages.upsert — type: notify, count: 1

📩 New message from <name>:
   "their message text"

[saved] -> messages.json now has 1 message(s)
```

If that works, open the newly created `messages.json` in this folder to see the saved messages.

## Once this works reliably

We'll add Firebase back in as a separate, isolated step — writing from this same proven message handler into Firestore, instead of (or alongside) the local JSON file.
