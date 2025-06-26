const { EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const comandosEstoque = require('../commands/estoque');
const moment = require('moment');
require('moment-duration-format');

const db = new QuickDB();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot) return;

        // --- SISTEMA AFK MELHORADO ---
        const afkData = await db.get(`afk_${message.author.id}`);
        if (afkData) {
            await db.delete(`afk_${message.author.id}`);
            const afkStarted = moment(afkData.timestamp * 1000);
            const now = moment();
            const duration = moment.duration(now.diff(afkStarted)).format("d[d], h[h], m[m], s[s]");
            
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#8a00ff')
                .setTitle(`👋 Bem-vindo(a) de volta, ${message.author.username}!`)
                .setDescription(`Seu status AFK foi removido automaticamente.\n\n⏰ **Tempo ausente:** ${duration}`)
                .setThumbnail(message.author.displayAvatarURL())
                .setTimestamp();
            
            const sentMessage = await message.reply({ embeds: [welcomeEmbed] });
            setTimeout(() => sentMessage.delete().catch(() => {}), 15000);
        }

        // --- NOTIFICAÇÕES DE MENÇÃO AFK MELHORADAS ---
        const mentionedUsers = message.mentions.users;
        if (mentionedUsers.size > 0) {
            for (const [userId, mentionedUser] of mentionedUsers) {
                const mentionedAfkData = await db.get(`afk_${mentionedUser.id}`);
                if (mentionedAfkData) {
                    const afkResponseEmbed = new EmbedBuilder()
                        .setColor('#8a00ff')
                        .setAuthor({ 
                            name: `${mentionedUser.username} está ausente`, 
                            iconURL: mentionedUser.displayAvatarURL() 
                        })
                        .setDescription(`**Motivo da ausência:**\n\`\`\`${mentionedAfkData.motivo}\`\`\``)
                        .addFields({ 
                            name: '⏰ Ausente desde', 
                            value: `<t:${mentionedAfkData.timestamp}:R>`, 
                            inline: true 
                        })
                        .setFooter({ 
                            text: 'Ele(a) será notificado(a) da sua menção quando retornar.' 
                        })
                        .setTimestamp();
                    
                    const replyMessage = await message.reply({ embeds: [afkResponseEmbed] });
                    setTimeout(() => replyMessage.delete().catch(() => {}), 30000);
                }
            }
        }

        // --- SISTEMA DE IMPORTAÇÃO DE ESTOQUE MELHORADO ---
        if (message.attachments.size > 0 && message.member.permissions.has('ManageGuild')) {
            const attachment = message.attachments.first();
            const nome = attachment.name.toLowerCase();
            
            if (nome.endsWith(".txt") || nome.endsWith(".json")) {
                console.log(`[Estoque] Admin ${message.author.tag} enviou arquivo: ${attachment.name}`);
                
                // Reação de processamento
                await message.react('⏳').catch(() => {});
                
                try {
                    const sucesso = await comandosEstoque.handleArquivoImportado(message);
                    
                    if (sucesso) {
                        await message.react('✅').catch(() => {});
                        await message.react('⏳').then(r => r.remove()).catch(() => {});
                    } else {
                        await message.react('❌').catch(() => {});
                        await message.react('⏳').then(r => r.remove()).catch(() => {});
                    }
                } catch (error) {
                    console.error('[Estoque] Erro ao processar arquivo:', error);
                    await message.react('❌').catch(() => {});
                    await message.react('⏳').then(r => r.remove()).catch(() => {});
                }
            }
        }
    },
};