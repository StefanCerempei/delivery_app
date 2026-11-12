// Fișier de pornire pentru Hostinger (Entry file: backend-api/index.cjs).
//
// Hostinger pornește aplicațiile Node.js prin LiteSpeed (lsnode.js), care încarcă
// fișierul de intrare cu require(). Serverul nostru e scris ca ES module (import/export),
// iar require() nu poate încărca direct un ES module pe Node 20 → aplicația cădea cu 503.
// Acest fișier CommonJS doar încarcă serverul real prin import().

process.on('uncaughtException', (err) => {
    console.error('[reloq] Uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('[reloq] Unhandled rejection:', err);
});

import('./server.js').catch((err) => {
    console.error('[reloq] Serverul nu a putut porni:', err);
    process.exitCode = 1;
});
