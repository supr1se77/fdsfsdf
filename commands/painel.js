const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
    Colors
} = require("discord.js");
const config = require("../config.json");
const { logAdmin } = require("../utils/logger");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("painel")
        .setDescription("Envia o painel principal da loja.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            const painelEmbed = new EmbedBuilder()
                .setColor('#8a00ff')
                .setTitle('🏪 Painel Principal da Loja')
                .setDescription('Bem-vindo ao nosso sistema de vendas! Escolha uma das opções abaixo:')
                .setThumbnail('https://media.discordapp.net/attachments/1376705206913339493/1383586879475154975/LOGO_GIF.gif?ex=684f5531&is=684e03b1&hm=f1550c9b4c785522e05ef67e75cfcb3fabec7fb681524e4227dbbd238a380510&=')
                .addFields(
                    { name: '🛒 Compras', value: 'Acesse nossa loja e compre produtos', inline: true },
                    { name: '🔄 Trocas', value: 'Solicite troca de produtos com defeito', inline: true },
                    { name: '📜 Termos', value: 'Leia nossos termos de troca e garantia', inline: true }
                )
                .setFooter({ text: 'Loja Legacy - Qualidade garantida!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('painel:abrir_compras')
                    .setLabel('🛒 Comprar')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('painel:abrir_troca')
                    .setLabel('🔄 Solicitar Troca')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('painel:termos_troca')
                    .setLabel('📜 Termos')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                embeds: [painelEmbed],
                components: [row]
            });

            await logAdmin(
                interaction.client,
                interaction.user,
                'Enviou o painel principal da loja.',
                '/painel'
            );

        } catch (error) {
            console.error('Erro no comando /painel:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Erro ao enviar o painel. Tente novamente.',
                    ephemeral: true
                });
            }
        }
    },

    async handleButton(interaction) {
        const action = interaction.customId.split(':')[1];

        try {
            switch (action) {
                case 'abrir_compras':
                    await interaction.reply({
                        content: '🛒 **Loja de Produtos**\n\nEscolha uma categoria abaixo para ver os produtos disponíveis:',
                        ephemeral: true
                    });
                    break;

                case 'termos_troca':
                    const termosEmbed = new EmbedBuilder()
                        .setTitle("📜 Termos de Troca & Garantia")
                        .setDescription(
                            `Você precisa enviar um vídeo mostrando:
• A data e hora no site da Magalu ou Tramontina;
• A tentativa de compra de um produto até R$150;
• Tudo isso dentro do prazo de 10 minutos após a liberação da info.

**Importante:**

Se o vídeo ou o contato não forem enviados dentro do prazo, não será feita a troca.

Compre apenas se estiver de acordo com essas condições. Caso contrário, por favor, não compre!

💬 | Caso necessite de alguma ajuda, abra ticket <#1375627890556801108>`
                        )
                        .setColor("#8a00ff");

                    await interaction.reply({ embeds: [termosEmbed], ephemeral: true });
                    break;

                case 'abrir_troca':
                    await interaction.deferReply({ ephemeral: true });

                    try {
                        const guild = interaction.guild;
                        const user = interaction.user;
                        const categoriaId = config.categoriaTrocaID;

                        if (!categoriaId) {
                            return interaction.editReply({
                                content: '❌ Categoria de troca não configurada. Contate um administrador.'
                            });
                        }

                        const categoria = guild.channels.cache.get(categoriaId);
                        if (!categoria) {
                            return interaction.editReply({
                                content: '❌ Categoria de troca não encontrada. Contate um administrador.'
                            });
                        }

                        // Verifica se já existe um canal de troca para o usuário
                        const canalExistente = guild.channels.cache.find(
                            channel => channel.name === `troca-${user.username.toLowerCase()}` && 
                            channel.parentId === categoriaId
                        );

                        if (canalExistente) {
                            return interaction.editReply({
                                content: `❌ Você já possui um canal de troca ativo: <#${canalExistente.id}>`
                            });
                        }

                        // Cria o canal de troca
                        const canalTroca = await guild.channels.create({
                            name: `troca-${user.username.toLowerCase()}`,
                            type: ChannelType.GuildText,
                            parent: categoriaId,
                            permissionOverwrites: [
                                {
                                    id: guild.roles.everyone.id,
                                    deny: ['ViewChannel']
                                },
                                {
                                    id: user.id,
                                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                                },
                                {
                                    id: config.cargoAdminID,
                                    allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages']
                                }
                            ]
                        });

                        const embedTroca = new EmbedBuilder()
                            .setColor(Colors.Orange)
                            .setTitle('🔄 Canal de Troca Criado')
                            .setDescription(`Olá ${user}! Este é seu canal para solicitar trocas.`)
                            .addFields(
                                { name: '📋 Como proceder:', value: '1. Descreva o problema com seu produto\n2. Envie prints/vídeos como prova\n3. Aguarde o atendimento da equipe' },
                                { name: '⏰ Prazo:', value: 'Você tem 10 minutos após receber o produto para solicitar a troca.' },
                                { name: '📞 Suporte:', value: 'Nossa equipe responderá em breve.' }
                            )
                            .setFooter({ text: 'Loja Legacy - Estamos aqui para ajudar!' })
                            .setTimestamp();

                        await canalTroca.send({ content: `${user}`, embeds: [embedTroca] });

                        await interaction.editReply({
                            content: `✅ Canal de troca criado com sucesso! Acesse: <#${canalTroca.id}>`
                        });

                        await logAdmin(
                            interaction.client,
                            user,
                            `Criou um canal de troca: ${canalTroca.name}`,
                            'Painel de Troca'
                        );

                    } catch (error) {
                        console.error('Erro ao criar canal de troca:', error);
                        await interaction.editReply({
                            content: '❌ Erro ao criar canal de troca. Contate um administrador.'
                        });
                    }
                    break;

                default:
                    await interaction.reply({
                        content: '❌ Ação não reconhecida.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Erro no handleButton do painel:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Erro ao processar sua solicitação.',
                    ephemeral: true
                });
            }
        }
    }
};