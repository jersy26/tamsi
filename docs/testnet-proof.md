# Testnet proof

Run: 2026-11-05T17:14:49.653Z. Written by `scripts/spike.ts`.

**Can a non-owner treasury fund a card?** Yes. The treasury funded a card owned by a different wallet, and the agent then spent from it.

- Card UID: `spike-1793898799440`
- Device hash: `cc31836a7fac1f450876439384460df6cd53afaa6c5dc143a5a489455eda683a`
- Owner (OFW): `GDXYRFJHVNSWNV7GCEIK4AYTJDG65VNOL7MKROWLRGHNFLZZCHYMBOJV`
- Treasury: `GBRFIH6D4FOG333NO43DRQ74AZLEQQCEI4KJ4H7EAKQ3ACRCUITNCU45`
- Agent: `GCPMYQRGADAXUP4W3LQM35NFW5I2UIGKJ3OS4OR2EFFIRR4J6LQZ62MR`
- Merchant: `GBMNUNAEFSBY6E7NHN6LJ7ESPPPGKBSSL4DWO2ULU4MHD5FJA3J3VD2J`

- registerDevice (OFW): https://stellar.expert/explorer/testnet/tx/26e2d6943d6821c71148d634df168a1ca9afbfb6e24292d43bbe5a42d2033066
- registerAgent (OFW): https://stellar.expert/explorer/testnet/tx/cd723528c299b58e3610299196921f706f8b99d9e39ab57e058c96bdfab0cd72
- fundEscrow (treasury, not the owner): https://stellar.expert/explorer/testnet/tx/866de1e4665359aa381da905072bc59fc2ce721d4f8a9ef0c20d29611d5126e1
- authorizePayment (agent): https://stellar.expert/explorer/testnet/tx/333622ee2f73387ee6f6f4aa64253fb7eeee376dbd0df5ebac42de283cfe7329
- claim (merchant): https://stellar.expert/explorer/testnet/tx/bac959c44b1529d9c3f9f88f59abc422bfa22139ce480326c24f62433961b7a3

## The Nov 7 redesign, tapped through the screens

- authorizePayment on the live URL, ₱25 at Aling Nena's: https://stellar.expert/explorer/testnet/tx/36d204792513b93b9706062c80fc2588135fbc0ab0981fbfa03aa2b03d41f5ba
- authorizePayment from a local server: https://stellar.expert/explorer/testnet/tx/9cbf2fea9037ea687ecb2f2f93d9808e618337d7c4a21b6f3c5bf87ec32a8dc2
- claim from a local server: https://stellar.expert/explorer/testnet/tx/6b549e66fb306595bba19e046f92ea031e280388f5836d4459fbdddf1bb6e994
