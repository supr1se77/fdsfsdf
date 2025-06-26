const { EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config.json");

const pino = require('pino');
const consoleLogger = pino({
    transport: {
        target: 'pino-pretty',
        options: { 
            colorize: true, 
            ignore: 'pid,hostname', 
            translateTime: 'SYS:dd-mm-yyyy HH:MM:ss' 
        },
    },
});

const info = (message) => consoleLogger.info(message);
const warn = (message) => consoleLogger.warn(message);
const error = (message, err) => consoleLogger.error({ msg: message, err: err?.stack || err });

async function logPagamento(client, tipo, user, detalhes = {}) {
    try {
        const canalLogs = await client.channels.fetch(config.canalLogsPagamentoID).catch(() => null);
        if (!canalLogs) {
            return error(`[Logger] Canal de logs com ID ${config.canalLogsPagamentoID} não foi encontrado.`);
        }

        const defs = {
            compra: { title: "Nova Compra Iniciada", color: Colors.Blue, emoji: "🛒" },
            pagamento_confirmado: { title: "Pagamento Confirmado", color: Colors.Green, emoji: "✅" },
            entrega_manual: { title: "Entrega Manual Realizada", color: '#1ABC9C', emoji: "✍️" },
            cancelamento: { title: "Compra Cancelada", color: Colors.Orange, emoji: "🚫" },
            busca: { title: "Busca Realizada", color: Colors.Purple, emoji: "🔍" },
            erro: { title: "Erro Crítico no Checkout", color: Colors.Red, emoji: "❌" },
            entrega_falhou: { title: "Falha na Entrega por DM", color: Colors.DarkRed, emoji: "⚠️" },
            info: { title: "Log de Atividade", color: Colors.Grey, emoji: "📝" },
        };
        const def = defs[tipo] || defs.info;

        const userTag = `${user.username}${user.discriminator === '0' ? '' : `#${user.discriminator}`}`;

        const embed = new EmbedBuilder()
            .setColor(def.color)
            .setTitle(`${def.emoji} ${def.title}`)
            .setAuthor({ name: userTag, iconURL: user.displayAvatarURL() })
            .setTimestamp()
            .setFooter({ text: `ID do Usuário: ${user.id}` });

        const { valor, categoria, item, motivo, produto, tipoBusca, valorBuscado, deliveryMessage } = detalhes;

        const fields = [];
        if (categoria) fields.push({ name: "📦 Categoria", value: `**${categoria}**`, inline: true });
        if (produto) fields.push({ name: "📦 Produto", value: `**${produto}**`, inline: true });
        if (valor) fields.push({ name: "💰 Valor", value: `R$ ${typeof valor === 'number' ? valor.toFixed(2).replace('.', ',') : valor}`, inline: true });
        if (item) fields.push({ name: "🆔 Item Entregue", value: `\`\`\`${item}\`\`\``, inline: false });
        if (tipoBusca) fields.push({ name: "🔍 Tipo de Busca", value: tipoBusca, inline: true });
        if (valorBuscado) fields.push({ name: "🎯 Termo Buscado", value: `\`${valorBuscado}\``, inline: true });
        if (motivo) fields.push({ name: "📝 Motivo/Admin", value: motivo, inline: false });
        if (deliveryMessage) fields.push({ name: "🚚 Dados para Entrega Manual", value: deliveryMessage, inline: false });

        if (fields.length > 0) embed.addFields(fields);
        
        const row = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
                .setLabel("👤 Ver Perfil")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${user.id}`)
        );

        // Adiciona botões especiais para casos de erro
        if (tipo === 'entrega_falhou' || tipo === 'erro') {
            const dadosParaReenvio = Buffer.from(JSON.stringify({ 
                userId: user.id, 
                message: deliveryMessage || 'N/A' 
            })).toString('base64');
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`log:reenviar_dm:${dadosParaReenvio}`)
                    .setLabel("🆘 Tentar Reenviar por DM")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🆘')
            );
        }

        // Adiciona botão de estatísticas para pagamentos confirmados
        if (tipo === 'pagamento_confirmado') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`log:stats:${user.id}`)
                    .setLabel("📊 Ver Estatísticas")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊')
            );
        }

        const sentMessage = await canalLogs.send({ embeds: [embed], components: [row] });
        return sentMessage;

    } catch (e) {
        error(`Ocorreu um erro CRÍTICO ao tentar enviar o log de pagamento:`, e);
    }
}

async function logAdmin(client, adminUser, acao, comando) {
    try {
        const canalLogs = await client.channels.fetch(config.canalLogsPagamentoID).catch(() => null);
        if (!canalLogs) return;

        const embed = new EmbedBuilder()
            .setColor(Colors.DarkVividPink)
            .setTitle(`🛡️ Ação Administrativa`)
            .setAuthor({ name: adminUser.tag, iconURL: adminUser.displayAvatarURL() })
            .addFields(
                { name: "⚙️ Comando Usado", value: `\`${comando}\``, inline: true },
                { name: "📋 Ação Realizada", value: acao, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `ID do Admin: ${adminUser.id}` });
            
        const row = new ActionRowBuilder().addComponents(
             new ButtonBuilder()
                .setLabel("👤 Ver Perfil do Admin")
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${adminUser.id}`)
        );

        await canalLogs.send({ embeds: [embed], components: [row] });
    } catch(e) {
        error(`Falha ao enviar log de admin:`, e);
    }
}

async function handleLogButton(interaction) {
    const [logPrefix, action, dataB64] = interaction.customId.split(':');
    
    if (action === 'reenviar_dm') {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const dados = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
            const { userId, message } = dados;
            
            if (!message || message === 'N/A') {
                return interaction.editReply({ 
                    content: '❌ Não há dados de entrega para reenviar a partir deste log.' 
                });
            }

            const user = await interaction.client.users.fetch(userId);
            await user.send({ content: message });

            await interaction.editReply({ 
                content: `✅ Mensagem de entrega reenviada com sucesso para ${user.tag}!` 
            });
            
            await logAdmin(
                interaction.client, 
                interaction.user, 
                `Reenviou um produto manualmente para ${user.tag} a partir de um log de erro.`, 
                'Botão de Log'
            );

        } catch (e) {
            console.error("Erro ao reenviar DM pelo log:", e);
            await interaction.editReply({ 
                content: `❌ Falha ao reenviar DM. O usuário pode ter as DMs bloqueadas. Erro: ${e.message}` 
            });
        }
    }
    
    if (action === 'stats') {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const userId = dataB64;
            const user = await interaction.client.users.fetch(userId);
            
            // Aqui você pode implementar estatísticas mais detalhadas
            const statsEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle("📊 Estatísticas do Cliente")
                .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
                .setDescription("Estatísticas básicas deste cliente.")
                .addFields(
                    { name: "👤 Usuário", value: `<@${userId}>`, inline: true },
                    { name: "📅 Conta Criada", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: "🔗 ID", value: `\`${userId}\``, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [statsEmbed] });
            
        } catch (e) {
            console.error("Erro ao mostrar estatísticas:", e);
            await interaction.editReply({ 
                content: `❌ Erro ao carregar estatísticas: ${e.message}` 
            });
        }
    }
}

module.exports = {
    info,
    warn,
    error,
    logPagamento,
    logAdmin,
    handleLogButton,
};