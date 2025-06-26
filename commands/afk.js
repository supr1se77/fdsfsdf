// commands/afk.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Define seu status como ausente (AFK).')
        .addStringOption(option =>
            option.setName('motivo')
                .setDescription('O motivo da sua ausência.')
                .setRequired(false)),

    async execute(interaction) {
        // A lógica do comando permanece a mesma: apenas define o status.
        const motivo = interaction.options.getString('motivo') || 'Não especificado';
        const user = interaction.user;
        const timestamp = Math.floor(Date.now() / 1000);

        await db.set(`afk_${user.id}`, {
            motivo: motivo,
            timestamp: timestamp
        });

        const afkEmbed = new EmbedBuilder()
            .setColor('#8a00ff')
            .setTitle('✅ Status AFK Ativado')
            .setDescription(`Você agora está ausente. Qualquer pessoa que te mencionar será notificada.`)
            .addFields(
                { name: '📝 Motivo', value: `\`\`\`${motivo}\`\`\`` },
                { name: '⏰ Ausente desde', value: `<t:${timestamp}:R>` }
            )
            .setFooter({ text: 'Seu status será removido assim que você enviar uma mensagem.' })
            .setTimestamp();

        await interaction.reply({ embeds: [afkEmbed], ephemeral: true });
    },
};