const fs = require('fs');
const path = require('path');

function removerCartaoDoEstoque(numeroCartao) {
  const estoquePath = path.resolve(__dirname, '../estoque.json');
  const raw = fs.readFileSync(estoquePath, 'utf-8');
  const estoque = JSON.parse(raw);
  let alterado = false;

  for (const cat in estoque) {
    const antes = estoque[cat].length;
    estoque[cat] = estoque[cat].filter(linha => !linha.includes(numeroCartao));
    if (estoque[cat].length < antes) {
      alterado = true;
    }
  }

  if (alterado) {
    fs.writeFileSync(estoquePath, JSON.stringify(estoque, null, 2));
  }
  return alterado;
}

module.exports = removerCartaoDoEstoque;