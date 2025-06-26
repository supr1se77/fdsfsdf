const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
// Assumindo que seu services/zeroone.js exporta 'listarTransacoesAprovadas'
const { listarTransacoesAprovadas } = require("../services/zeroone");
const config = require("../config.json");

// Cache para armazenar os dados de vendas e evitar chamadas repetidas à API
const salesCache = {
    data: [],
    lastFetch: 0,
    isFetching: false,
};
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

// --- FUNÇÕES AUXILIARES ---

async function fetchSalesData() {
    if (salesCache.isFetching) {
        console.log("[Vendas] Busca de dados já em andamento, aguardando...");
        // Espera um pouco para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 2000));
        return salesCache.data;
    }

    salesCache.isFetching = true;
    console.log("------------------------------------------");
    console.log("[Vendas] Iniciando busca de dados na API ZeroOne...");
    try {
        const sales = await listarTransacoesAprovadas();
        if (!sales || sales.length === 0) {
            console.warn("[Vendas] AVISO: A busca na API terminou mas nenhuma venda foi encontrada.");
        } else {
            console.log(`[Vendas] Busca na API finalizada. Total de ${sales.length} vendas encontradas.`);
        }
        salesCache.data = sales || []; // Garante que seja sempre um array
        salesCache.lastFetch = Date.now();
        return salesCache.data;
    } catch (error) {
        console.error("[Vendas] Erro crítico ao buscar dados de vendas:", error);
        return []; // Retorna um array vazio em caso de erro
    } finally {
        salesCache.isFetching = false;
        console.log("------------------------------------------");
    }
}

function processSales(sales, periodDays) {
    const now = Date.now();
    const cutoff = periodDays > 0 ? now - periodDays * 24 * 60 * 60 * 1000 : 0;
    const filteredSales = periodDays > 0 ? sales.filter(s => s.timestamp >= cutoff) : sales;
    
    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.valor, 0);
    const salesCount = filteredSales.length;
    const averageTicket = salesCount > 0 ? totalRevenue / salesCount : 0;
    
    return { totalRevenue, salesCount, averageTicket };
}

function createSalesEmbed(periodName, stats) {
    const { totalRevenue, salesCount, averageTicket } = stats;
    return new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`📊 Painel de Vendas | ${periodName}`)
        .setDescription("Análise de performance de vendas da sua loja, com dados diretos da API.")
        .setThumbnail("https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=")
        .addFields(
            { name: "💰 Faturamento Total", value: `**R$ ${totalRevenue.toFixed(2).replace('.', ',')}**`, inline: true },
            { name: "🛒 Vendas Aprovadas", value: `\`${salesCount}\``, inline: true },
            { name: "📈 Ticket Médio", value: `R$ ${averageTicket.toFixed(2).replace('.', ',')}`, inline: true },
        )
        .setFooter({ text: `Fonte: API ZeroOne | Cache atualizado em` })
        .setTimestamp();
}

async function showDashboard(interaction, periodDays) {
    const periodNames = { 1: "Últimas 24 Horas", 7: "Últimos 7 Dias", 30: "Últimos 30 Dias", 0: "Todo o Período" };
    const stats = processSales(salesCache.data, periodDays);
    const embed = createSalesEmbed(periodNames[periodDays], stats);
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vendas:periodo:1`).setLabel("24 Horas").setStyle(periodDays === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`vendas:periodo:7`).setLabel("7 Dias").setStyle(periodDays === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`vendas:periodo:30`).setLabel("30 Dias").setStyle(periodDays === 30 ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`vendas:periodo:0`).setLabel("Todo o Período").setStyle(periodDays === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("vendas:refresh:0").setLabel("Atualizar Dados da API").setStyle(ButtonStyle.Success).setEmoji("🔄")),
    ];
    
    // Usa editReply se a interação já foi respondida, ou update se foi um botão
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: null, embeds: [embed], components: components });
    } else {
        await interaction.update({ content: null, embeds: [embed], components: components });
    }
}

// --- ESTRUTURA PRINCIPAL DO COMANDO ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName("vendas")
        .setDescription("Exibe o painel de análise de vendas.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const initialEmbed = new EmbedBuilder().setColor(Colors.DarkGrey).setTitle("Painel de Vendas").setDescription("Clique no botão abaixo para carregar os dados de vendas direto da API.\n\n*A busca pode levar alguns segundos.*").setThumbnail("https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=");
        const initialRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("vendas:carregar:initial").setLabel("Carregar Relatório da API").setStyle(ButtonStyle.Success).setEmoji("📊"));
        await interaction.reply({ embeds: [initialEmbed], components: [initialRow], ephemeral: true });
    },

    // ==================================================================================
    // ===== CORREÇÃO APLICADA AQUI =====================================================
    // ==================================================================================
    // Renomeado de 'handleInteraction' para 'handleButton' para funcionar com o novo interactionCreate.js
    async handleButton(interaction) {
        // Filtra para garantir que este comando só processe botões que começam com "vendas:"
        if (!interaction.customId.startsWith("vendas:")) return;
        
        const [prefix, action, value] = interaction.customId.split(":");

        const actions = {
            carregar: async () => {
                await interaction.update({ content: "🔄 Conectando com a API e buscando dados, por favor aguarde...", embeds: [], components: [] });
                const now = Date.now();
                // Força a busca se o cache estiver velho ou vazio
                if (now - salesCache.lastFetch > CACHE_DURATION || salesCache.data.length === 0) {
                    await fetchSalesData();
                }
                // Mostra o painel com o período padrão de 7 dias
                await showDashboard(interaction, 7);
            },
            refresh: async () => {
                await interaction.update({ content: "🔄 Atualizando dados direto da API...", embeds: [], components: [] });
                await fetchSalesData(); // Força a busca na API
                await showDashboard(interaction, 7);
            },
            periodo: async () => {
                const periodDays = parseInt(value, 10);
                // Apenas atualiza a tela, não precisa de mensagem de "carregando"
                await showDashboard(interaction, periodDays);
            }
        };

        if (actions[action]) {
            await actions[action]();
        }
    }
};