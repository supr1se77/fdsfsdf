const fs = require("fs");
const path = require("path");

const ESTOQUE_PATH = path.resolve(__dirname, "../estoque.json");

function carregarEstoque() {
  if (!fs.existsSync(ESTOQUE_PATH)) fs.writeFileSync(ESTOQUE_PATH, JSON.stringify({}, null, 2));
  return JSON.parse(fs.readFileSync(ESTOQUE_PATH, "utf-8"));
}

function transformarEstoque(estoque) {
  // Agora pega estoque no formato correto: { categoria: {cartoes: [], preco: ...} }
  const arr = [];
  for (const categoria in estoque) {
    const dados = estoque[categoria];
    const cartoes = Array.isArray(dados) ? dados : (dados.cartoes || []);
    for (const linha of cartoes) {
      const partes = linha.split("|").map((s) => s.trim());
      arr.push({
        numero: partes[0] || "",
        mes: partes[1] || "",
        ano: partes[2] || "",
        cvv: partes[3] || "",
        bandeira: partes[4] || "",
        banco: partes[5] || "",
        level: partes[6] || "",
        nome: partes[7] || "",
        cpf: partes[8] || "",
        preco: partes[9] || dados.preco || null,
        categoria,
      });
    }
  }
  return arr;
}

// ... outras funções de pesquisa, filtro, mascarar etc.
function mascararNumero(numero) {
  if (!numero) return "N/D";
  return numero.slice(0, 4) + " **** **** " + numero.slice(-4);
}

function filtrarCartoes(campo, valor, estoqueArr) {
  valor = valor.toLowerCase();
  return estoqueArr.filter((cartao) => {
    if (cartao[campo]) {
      return String(cartao[campo]).toLowerCase().includes(valor);
    }
    return false;
  });
}

function removerCartaoDoEstoque(numeroCartao) {
  const estoque = carregarEstoque();
  let alterado = false;
  for (const cat in estoque) {
    const antes = estoque[cat].length;
    // Remove só o cartão EXATO pelo número (pode ser melhorado)
    estoque[cat] = estoque[cat].filter(linha => !linha.startsWith(numeroCartao + "|"));
    if (estoque[cat].length < antes) alterado = true;
  }
  if (alterado) fs.writeFileSync(ESTOQUE_PATH, JSON.stringify(estoque, null, 2));
  return alterado;
}

module.exports = {
  carregarEstoque,
  transformarEstoque,
  filtrarCartoes,
  mascararNumero,
  removerCartaoDoEstoque,
};