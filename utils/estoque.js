const fs = require("fs");
const path = require("path");

const estoquePath = path.resolve(__dirname, "../estoque.json");

// ===================================================================================
// FUNÇÕES DE LEITURA E ESCRITA
// ===================================================================================

function lerEstoque() {
    if (!fs.existsSync(estoquePath)) {
        fs.writeFileSync(estoquePath, JSON.stringify({}, null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(estoquePath, "utf-8"));
    } catch (e) {
        console.error("ERRO GRAVE: Falha ao ler ou parsear o arquivo estoque.json.", e);
        return {}; 
    }
}

function salvarEstoque(estoque) {
    fs.writeFileSync(estoquePath, JSON.stringify(estoque, null, 2));
}

// ===================================================================================
// FUNÇÃO UNIVERSAL PARA REMOVER ITENS
// ===================================================================================

function removerItemDoEstoque(tipo, categoria, identificador) {
    const estoque = lerEstoque();
    if (!estoque[categoria]) {
        console.error(`[REMOVER FALHOU] Categoria '${categoria}' não encontrada no estoque.`);
        return;
    }

    try {
        let itemRemovido = false;

        if ((tipo === 'steam' || tipo === 'roblox') && Array.isArray(estoque[categoria].contas)) {
            const index = estoque[categoria].contas.findIndex(c => c.login === identificador);
            if (index > -1) {
                estoque[categoria].contas.splice(index, 1);
                itemRemovido = true;
            }
        } 
        else if (tipo === 'giftcard' && Array.isArray(estoque[categoria].codigos)) {
            const index = estoque[categoria].codigos.findIndex(codigo => codigo === identificador);
            if (index > -1) {
                estoque[categoria].codigos.splice(index, 1);
                itemRemovido = true;
            }
        }
        else if (tipo === 'cartao' && Array.isArray(estoque[categoria].cartoes)) {
            const index = estoque[categoria].cartoes.findIndex(cc => cc.startsWith(identificador));
            if (index > -1) {
                estoque[categoria].cartoes.splice(index, 1);
                itemRemovido = true;
            }
        }

        if (itemRemovido) {
            salvarEstoque(estoque);
            console.log(`[ESTOQUE] Item do tipo '${tipo}' ('${identificador}') foi removido com sucesso da categoria '${categoria}'.`);
        } else {
            console.log(`[ESTOQUE] AVISO: Item do tipo '${tipo}' ('${identificador}') não foi encontrado na categoria '${categoria}' para remoção.`);
        }

    } catch (error) {
        console.error(`ERRO GRAVE: Falha ao remover item do estoque.`, error);
    }
}

// ===================================================================================
// FUNÇÕES DE TRANSFORMAÇÃO E FILTRO
// ===================================================================================

function parseLinhaCartao(linha) {
    const partes = linha.split("|").map(p => p.trim().toUpperCase());
    
    const cardInfo = {
        numero: partes[0] || "N/D",
        mes: partes[1] || "N/D",
        ano: partes[2] || "N/D",
        cvv: partes[3] || "N/D",
        bandeira: "N/D",
        banco: "N/D",
        level: "N/D",
    };

    const informacoesRestantes = partes.slice(4).join(' ');

    const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "AMEX", "AMERICAN EXPRESS", "DISCOVER", "HIPERCARD"];
    const LEVELS = ["BLACK", "PLATINUM", "GOLD", "INFINITE", "BUSINESS", "STANDARD", "CLASSIC", "SIGNATURE", "CORPORATE"];
    const BANCOS_CONHECIDOS = ["NUBANK", "ITAU", "BRADESCO", "SANTANDER", "CAIXA", "BB", "BANCO DO BRASIL", "INTER"];
    
    let infoString = informacoesRestantes;

    for (const level of LEVELS.sort((a, b) => b.length - a.length)) {
        if (infoString.includes(level)) {
            cardInfo.level = level;
            infoString = infoString.replace(level, '').trim();
            break; 
        }
    }
    
    for (const bandeira of BANDEIRAS) {
        if (infoString.includes(bandeira)) {
            cardInfo.bandeira = bandeira;
            infoString = infoString.replace(bandeira, '').trim();
            break;
        }
    }
    
    if(infoString.length > 1) {
        cardInfo.banco = infoString;
    }

    if (cardInfo.banco === "N/D") {
        for (const banco of BANCOS_CONHECIDOS) {
            if (informacoesRestantes.includes(banco)) {
                cardInfo.banco = banco;
                break;
            }
        }
    }

    return cardInfo;
}


function transformarEstoqueNovo(estoque) {
    const arr = [];
    for (const cat in estoque) {
        if (!cat || typeof estoque[cat] !== 'object' || !Array.isArray(estoque[cat].cartoes)) {
            continue;
        }
        for (const linha of estoque[cat].cartoes) {
            arr.push({
                ...parseLinhaCartao(linha),
                preco: estoque[cat].preco || null,
                categoria: cat,
            });
        }
    }
    return arr;
}

function filtrarCartoes(campo, valor, arr) {
    valor = valor.toLowerCase();
    return arr.filter(card => {
        const cardValue = (card[campo] || "").toLowerCase();
        if (campo === 'numero') return cardValue.startsWith(valor);
        return cardValue.includes(valor);
    });
}

// ===== CORREÇÃO AQUI =====
// Adicionamos a função 'parseLinhaCartao' para que ela possa ser usada em outros arquivos
module.exports = {
    lerEstoque,
    salvarEstoque,
    removerItemDoEstoque,
    transformarEstoqueNovo,
    filtrarCartoes,
    parseLinhaCartao, 
};