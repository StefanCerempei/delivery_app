// WebMCP: unelte pentru agenții AI care rulează în browser (navigator.modelContext).
// Sunt aceleași unelte doar-citire ca serverul MCP de la /mcp (informații, prețuri, ferestre libere, estimare).
// Nu apar în dispecerat sau în panoul șoferilor. Fișier separat (nu script inline), ca să respecte CSP-ul site-ului.
(function () {
    if (/^\/(admin|driver|job)(\/|$)/.test(location.pathname)) return;
    var mc = navigator.modelContext;
    if (!mc || typeof mc.registerTool !== 'function') return;

    var nextId = 1;
    function callMcp(name, args) {
        return fetch('/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: name, arguments: args || {} } })
        })
            .then(function (r) { return r.json(); })
            .then(function (msg) {
                if (msg.error) return { content: [{ type: 'text', text: msg.error.message }], isError: true };
                return msg.result;
            })
            .catch(function () {
                return { content: [{ type: 'text', text: 'RELOQ could not be reached. Please try again.' }], isError: true };
            });
    }

    fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' })
    })
        .then(function (r) { return r.json(); })
        .then(function (msg) {
            (msg.result && msg.result.tools ? msg.result.tools : []).forEach(function (tool) {
                try {
                    mc.registerTool({
                        name: 'reloq_' + tool.name,
                        description: tool.description,
                        inputSchema: tool.inputSchema,
                        annotations: tool.annotations,
                        execute: function (args) { return callMcp(tool.name, args); }
                    });
                } catch (e) {
                    // unealtă deja înregistrată (navigare în aplicație) sau API diferit
                }
            });
        })
        .catch(function () {});
})();
