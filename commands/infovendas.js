const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
const { listarTransacoesAprovadas } = require("../services/zeroone");
const config = require("../config.json");

// Cache melhorado para armazenar os dados de vendas
const salesCache = {
    data: [],
    lastFetch: 0,
    isFetching: false,
    error: null
};
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

// --- FUNÇÕES AUXILIARES MELHORADAS ---

async function fetchSalesData() {
    if (salesCache.isFetching) {
        console.log("[Vendas] Busca de dados já em andamento, aguardando...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        return salesCache.data;
    }

    salesCache.isFetching = true;
    salesCache.error = null;
    
    console.log("------------------------------------------");
    console.log("[Vendas] Iniciando busca de dados na API ZeroOne...");
    
    try {
        const sales = await listarTransacoesAprovadas();
        if (!sales || sales.length === 0) {
            console.warn("[Vendas] AVISO: A busca na API terminou mas nenhuma venda foi encontrada.");
        } else {
            console.log(`[Vendas] Busca na API finalizada. Total de ${sales.length} vendas encontradas.`);
        }
        
        salesCache.data = sales || [];
        salesCache.lastFetch = Date.now();
        return salesCache.data;
        
    } catch (error) {
        console.error("[Vendas] Erro crítico ao buscar dados de vendas:", error);
        salesCache.error = error.message;
        return [];
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
    
    // Análises adicionais
    const dailyAverage = periodDays > 0 ? totalRevenue / periodDays : 0;
    const topSale = filteredSales.length > 0 ? Math.max(...filteredSales.map(s => s.valor)) : 0;
    
    return { 
        totalRevenue, 
        salesCount, 
        averageTicket, 
        dailyAverage, 
        topSale,
        period: periodDays 
    };
}

function createSalesEmbed(periodName, stats) {
    const { totalRevenue, salesCount, averageTicket, dailyAverage, topSale } = stats;
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle(`📊 Painel de Vendas | ${periodName}`)
        .setDescription("Análise de performance de vendas da sua loja, com dados diretos da API.")
        .setThumbnail("https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=")
        .addFields(
            { name: "💰 Faturamento Total", value: `**R$ ${totalRevenue.toFixed(2).replace('.', ',')}**`, inline: true },
            { name: "🛒 Vendas Aprovadas", value: `\`${salesCount}\``, inline: true },
            { name: "📈 Ticket Médio", value: `R$ ${averageTicket.toFixed(2).replace('.', ',')}`, inline: true }
        );

    // Adiciona campos extras para períodos específicos
    if (stats.period > 0) {
        embed.addFields(
            { name: "📅 Média Diária", value: `R$ ${dailyAverage.toFixed(2).replace('.', ',')}`, inline: true },
            { name: "🏆 Maior Venda", value: `R$ ${topSale.toFixed(2).replace('.', ',')}`, inline: true },
            { name: "⚡ Performance", value: salesCount > 0 ? "🟢 Ativo" : "🔴 Baixo", inline: true }
        );
    }

    // Adiciona informações de erro se houver
    if (salesCache.error) {
        embed.addFields({ 
            name: "⚠️ Aviso", 
            value: `Último erro: ${salesCache.error.slice(0, 100)}...`, 
            inline: false 
        });
    }

    embed.setFooter({ text: `Fonte: API ZeroOne | Cache atualizado em` })
         .setTimestamp();

    return embed;
}

async function showDashboard(interaction, periodDays) {
    const periodNames = { 
        1: "Últimas 24 Horas", 
        7: "Últimos 7 Dias", 
        30: "Últimos 30 Dias", 
        0: "Todo o Período" 
    };
    
    const stats = processSales(salesCache.data, periodDays);
    const embed = createSalesEmbed(periodNames[periodDays], stats);
    
    const components = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`vendas:periodo:1`)
                .setLabel("24 Horas")
                .setStyle(periodDays === 1 ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji("🕐"),
            new ButtonBuilder()
                .setCustomId(`vendas:periodo:7`)
                .setLabel("7 Dias")
                .setStyle(periodDays === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji("📅"),
            new ButtonBuilder()
                .setCustomId(`vendas:periodo:30`)
                .setLabel("30 Dias")
                .setStyle(periodDays === 30 ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji("📊"),
            new ButtonBuilder()
                .setCustomId(`vendas:periodo:0`)
                .setLabel("Todo o Período")
                .setStyle(periodDays === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji("🌐")
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("vendas:refresh:0")
                .setLabel("Atualizar Dados da API")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🔄"),
            new ButtonBuilder()
                .setCustomId("vendas:detalhes:0")
                .setLabel("Ver Detalhes")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📋")
        )
    ];
    
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: null, embeds: [embed], components: components });
    } else {
        await interaction.update({ content: null, embeds: [embed], components: components });
    }
}

function createDetailedEmbed(stats) {
    const { totalRevenue, salesCount, averageTicket, period } = stats;
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle("📋 Relatório Detalhado de Vendas")
        .setDescription("Análise completa dos dados de vendas disponíveis.")
        .setThumbnail("https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=");

    // Análise de tendências
    let tendencia = "📊 Estável";
    if (salesCount > 10) tendencia = "📈 Crescimento";
    else if (salesCount < 3) tendencia = "📉 Baixo Volume";

    embed.addFields(
        { name: "📊 Resumo Geral", value: `Total de vendas processadas: **${salesCount}**\nReceita total: **R$ ${totalRevenue.toFixed(2).replace('.', ',')}**`, inline: false },
        { name: "🎯 Métricas", value: `Ticket médio: **R$ ${averageTicket.toFixed(2).replace('.', ',')}**\nTendência: ${tendencia}`, inline: true },
        { name: "🔄 Cache", value: `Última atualização: <t:${Math.floor(salesCache.lastFetch / 1000)}:R>\nStatus: ${salesCache.error ? '🔴 Erro' : '🟢 OK'}`, inline: true }
    );

    if (period > 0) {
        const dailyAvg = totalRevenue / period;
        embed.addFields({ 
            name: "📅 Análise Temporal", 
            value: `Período: **${period} dia(s)**\nMédia diária: **R$ ${dailyAvg.toFixed(2).replace('.', ',')}**`, 
            inline: false 
        });
    }

    return embed;
}

// --- ESTRUTURA PRINCIPAL DO COMANDO ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName("vendas")
        .setDescription("Exibe o painel de análise de vendas.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        const initialEmbed = new EmbedBuilder()
            .setColor(Colors.DarkGrey)
            .setTitle("📊 Painel de Vendas")
            .setDescription("Clique no botão abaixo para carregar os dados de vendas direto da API.\n\n*A busca pode levar alguns segundos.*")
            .setThumbnail("https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=")
            .addFields({ 
                name: "💡 Dica", 
                value: "Este painel mostra dados em tempo real da sua API de pagamentos.", 
                inline: false 
            });

        const initialRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("vendas:carregar:initial")
                .setLabel("Carregar Relatório da API")
                .setStyle(ButtonStyle.Success)
                .setEmoji("📊")
        );

        await interaction.reply({ 
            embeds: [initialEmbed], 
            components: [initialRow], 
            ephemeral: true 
        });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith("vendas:")) return;
        
        const [prefix, action, value] = interaction.customId.split(":");

        const actions = {
            carregar: async () => {
                await interaction.update({ 
                    content: "🔄 Conectando com a API e buscando dados, por favor aguarde...", 
                    embeds: [], 
                    components: [] 
                });
                
                const now = Date.now();
                if (now - salesCache.lastFetch > CACHE_DURATION || salesCache.data.length === 0) {
                    await fetchSalesData();
                }
                
                await showDashboard(interaction, 7);
            },
            
            refresh: async () => {
                await interaction.update({ 
                    content: "🔄 Atualizando dados direto da API...", 
                    embeds: [], 
                    components: [] 
                });
                
                await fetchSalesData();
                await showDashboard(interaction, 7);
            },
            
            periodo: async () => {
                const periodDays = parseInt(value, 10);
                await showDashboard(interaction, periodDays);
            },
            
            detalhes: async () => {
                const stats = processSales(salesCache.data, 0);
                const detailEmbed = createDetailedEmbed(stats);
                
                const backButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("vendas:periodo:7")
                        .setLabel("Voltar ao Dashboard")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("⬅️")
                );
                
                await interaction.update({ 
                    embeds: [detailEmbed], 
                    components: [backButton] 
                });
            }
        };

        if (actions[action]) {
            await actions[action]();
        }
    }
};