const fetch = require("node-fetch");
const path = require('path');
const fs = require('fs');

// Carregando o config.json
const configPath = path.join(__dirname, '..', 'config.json');
let config;
try {
    const configFile = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configFile);
} catch (error) {
    console.error("[API] Erro ao carregar config.json:", error);
    throw new Error("Não foi possível carregar o arquivo de configuração");
}

// ==================================================================================
// ===== NOVO MODO DE TESTE =========================================================
// ==================================================================================
const MODO_TESTE = config.modoTeste === true;
if (MODO_TESTE) {
    console.warn("\nAVISO: O BOT ESTÁ RODANDO EM MODO DE TESTE. NENHUM PAGAMENTO REAL SERÁ GERADO.\n");
}
// Guarda o estado dos pagamentos de teste para simular o PENDING -> APPROVED
const pagamentosDeTeste = new Map();
// ==================================================================================


// --- INFORMAÇÕES DA API ---
const BASE_URL = "https://pay.zeroonepay.com.br/api/v1";
const SECRET_KEY = config.zeroOneSecretKey;

function getAuthHeaders() {
    if (!SECRET_KEY) {
        throw new Error("Chave secreta (zeroOneSecretKey) não configurada no config.json");
    }
    return {
        'Content-Type': 'application/json',
        'Authorization': SECRET_KEY
    };
}

async function criarPagamento(valor, produtoNome = "Produto via Discord") {
    // Se o modo de teste estiver ativo, retorna um pagamento falso
    if (MODO_TESTE) {
        console.log(`[MODO TESTE] Gerando pagamento falso para "${produtoNome}" no valor de R$ ${valor}.`);
        const fakePaymentId = `TESTE_${Date.now()}`;
        pagamentosDeTeste.set(fakePaymentId, 'PENDING'); // Define o pagamento como pendente
        return {
            id: fakePaymentId,
            pixCopyPaste: "PIX_COPIA_E_COLA_EM_MODO_TESTE",
            pixUrl: "https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=", // Imagem genérica de "processando"
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        };
    }

    // Lógica original para pagamentos reais
    const valorCentavos = Math.round(valor * 100);
    const payload = {
        name: "Usuário Discord", email: "discorduser@legacy.bot", cpf: "12345678909", phone: "16999999999",
        paymentMethod: "PIX", amount: valorCentavos, traceable: true,
        items: [{ unitPrice: valorCentavos, title: produtoNome, quantity: 1, tangible: false }]
    };

    try {
        const response = await fetch(`${BASE_URL}/transaction.purchase`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) {
            console.error(`[Pagamento] Erro na API: ${response.status}`, data);
            throw new Error(`Erro ao criar pagamento: ${data.message || 'Input validation failed'}`);
        }
        return { id: data.id, pixCopyPaste: data.pixCode, pixUrl: data.pixQrCode, status: data.status, expiresAt: data.expiresAt };
    } catch (error) {
        console.error("[Pagamento] Erro ao criar pagamento:", error.message);
        throw error;
    }
}

async function verificarPagamento(transactionId) {
    // Se for um ID de teste, simula a aprovação
    if (MODO_TESTE && pagamentosDeTeste.has(transactionId)) {
        // Na primeira verificação, ele ainda está pendente. Na segunda, é aprovado.
        if (pagamentosDeTeste.get(transactionId) === 'PENDING') {
            console.log(`[MODO TESTE] Verificação 1 para ${transactionId}: Status PENDING. A próxima será APPROVED.`);
            pagamentosDeTeste.set(transactionId, 'APPROVING'); // Muda o estado para aprovar na próxima
            return { status: 'PENDING' };
        } else {
            console.log(`[MODO TESTE] Verificação 2 para ${transactionId}: Status APPROVED.`);
            pagamentosDeTeste.delete(transactionId); // Limpa o mapa
            return { status: 'APPROVED' };
        }
    }

    // Lógica original para verificação real
    try {
        const response = await fetch(`${BASE_URL}/transaction.getPayment?id=${transactionId}`, { method: "GET", headers: getAuthHeaders() });
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("[Verificação] Erro:", error.message);
        return null;
    }
}

async function listarTransacoesAprovadas() {
    // Se o modo de teste estiver ativo, retorna dados falsos
    if (MODO_TESTE) {
        console.log("[MODO TESTE] Retornando lista de vendas falsa para o comando /vendas.");
        return [
            { valor: 75.50, categoria: "Produto Teste A", timestamp: Date.now() - (1 * 24 * 60 * 60 * 1000), status: 'APPROVED' },
            { valor: 30.00, categoria: "Produto Teste B", timestamp: Date.now() - (2 * 24 * 60 * 60 * 1000), status: 'APPROVED' },
            { valor: 120.00, categoria: "Produto Teste C", timestamp: Date.now() - (5 * 24 * 60 * 60 * 1000), status: 'APPROVED' },
        ];
    }

    // Lógica original para listagem real
    try {
        const response = await fetch(`${BASE_URL}/transaction.getPayment?status=APPROVED`, { method: "GET", headers: getAuthHeaders() });
        if (!response.ok) {
            const errorData = await response.text();
            console.error(`[Listagem Vendas] Erro na API: ${response.status} - ${errorData}`);
            throw new Error(`Erro ao listar transações: ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        return data.map(t => ({ valor: t.amount / 100, categoria: t.items?.[0]?.title || "API", timestamp: new Date(t.createdAt).getTime(), status: t.status, method: t.method }));
    } catch (error) {
        console.error("[Listagem Vendas] Erro crítico:", error.message);
        return [];
    }
}

module.exports = {
    createPixPayment: criarPagamento,
    getPaymentStatus: verificarPagamento,
    criarPagamento,
    verificarPagamento,
    listarTransacoesAprovadas
};