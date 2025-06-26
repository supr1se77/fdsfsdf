// services/magmaApi.js

const fetch = require('node-fetch');

const API_TOKEN = "d7c5436286e44288a459ca98de0e140bd32fe9717dcadb1c6bd13526f24a78b9";
const BASE_URL = "https://magmadatahub.com/api.php";

function gerarCpf() {
    const randomiza = () => Math.floor(Math.random() * 9);
    const base = Array.from({ length: 9 }, randomiza);

    const calculaDigito = (numeros) => {
        let soma = numeros.reduce((acc, val, idx) => acc + val * (numeros.length + 1 - idx), 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const d1 = calculaDigito(base);
    const d2 = calculaDigito([...base, d1]);

    return [...base, d1, d2].join('');
}

async function consultarCpf(cpf) {
  const cpfLimpo = String(cpf).replace(/\D/g, '');
  if (cpfLimpo.length !== 11) {
    return { error: 'INVALID_FORMAT' };
  }

  const url = `${BASE_URL}?token=${API_TOKEN}&cpf=${cpfLimpo}`;

  try {
    const response = await fetch(url);

    if (response.status === 401 || response.status === 403) {
      console.error(`[MagmaAPI] ERRO DE AUTENTICAÇÃO! Status: ${response.status}. Verifique seu API_TOKEN.`);
      return { error: 'INVALID_TOKEN' };
    }
    
    if (!response.ok) {
      console.warn(`[MagmaAPI] A API retornou um erro de servidor: ${response.status}`);
      return { error: 'API_ERROR' };
    }

    const data = await response.json();

    if (data && data.cpf) {
      console.log(`[MagmaAPI] Sucesso! CPF ${cpfLimpo} consultado.`);
      return {
        cpf: data.cpf,
        nome: (data.nome || '').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
        nascimento: data.nascimento || '',
        mae: (data.nome_mae || '').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
        sexo: data.sexo || 'Não informado'
      };
    }
    
    console.warn(`[MagmaAPI] CPF ${cpfLimpo} não encontrado na base de dados.`);
    return null;

  } catch (error) {
    console.error("[MagmaAPI] Erro de conexão ao consultar CPF:", error);
    return { error: 'CONNECTION_ERROR' };
  }
}

module.exports = { consultarCpf, gerarCpf };