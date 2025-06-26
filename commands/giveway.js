const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ChannelSelectMenuBuilder,
    ChannelType,
} = require("discord.js");
const db = require("../utils/database"); // Importando nosso gerenciador de DB

const sorteiosEmAndamento = new Map();
const sorteiosAtivos = new Map();

function parseDuration(durationString) {
    const regex = /(\d+)\s*(d|h|m|s)/gi;
    let totalMilliseconds = 0;
    if (!durationString || typeof durationString !== 'string') return 0;
    let match;
    while ((match = regex.exec(durationString)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === "d") totalMilliseconds += value * 86400000;
        else if (unit === "h") totalMilliseconds += value * 3600000;
        else if (unit === "m") totalMilliseconds += value * 60000;
        else if (unit === "s") totalMilliseconds += value * 1000;
    }
    return totalMilliseconds;
}

function criarPainelConfigSorteio(config, interactionId) {
    const duracaoMs = parseDuration(config.duracao);
    const dataFim = new Date(Date.now() + duracaoMs);
    const timestampFim = Math.floor(dataFim.getTime() / 1000);

    const previewEmbed = new EmbedBuilder()
        .setColor(config.cor)
        .setTitle(config.premio)
        .setThumbnail(config.thumbnail)
        .setDescription(config.descricao + `\n\n**Termina em:** <t:${timestampFim}:R>`)
        .setFooter({ text: config.footer, iconURL: config.autor.displayAvatarURL() })
        .setTimestamp(dataFim);

    if (config.ganhadorForcado) {
        previewEmbed.addFields({ name: '👑 Ganhador Definido', value: `<@${config.ganhadorForcado}>` });
    }
    if (config.requiredRoleId) {
        previewEmbed.addFields({ name: '🔒 Requisito de Cargo', value: `<@&${config.requiredRoleId}>` });
    }

    const configEmbed = new EmbedBuilder()
        .setColor('#8a00ff')
        .setTitle("Painel de Criação de Sorteio")
        .setDescription("Use os botões e menus abaixo para customizar. A prévia é atualizada em tempo real!")
        .addFields(
            { name: '📢 Canal de Anúncio', value: `<#${config.channel.id}>`, inline: true },
            { name: '👨‍💻 Admin', value: `<@${config.autor.id}>`, inline: true }
        );

    const channelSelectRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId(`sorteio:select_channel:${interactionId}`)
            .setPlaceholder("Clique para escolher o canal do sorteio")
            .addChannelTypes(ChannelType.GuildText)
    );

    const editRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sorteio:editar_premio:${interactionId}`).setLabel("Prêmio").setStyle(ButtonStyle.Secondary).setEmoji("🎁"),
        new ButtonBuilder().setCustomId(`sorteio:editar_descricao:${interactionId}`).setLabel("Descrição").setStyle(ButtonStyle.Secondary).setEmoji("📝"),
        new ButtonBuilder().setCustomId(`sorteio:editar_duracao:${interactionId}`).setLabel("Duração").setStyle(ButtonStyle.Secondary).setEmoji("🕒"),
        new ButtonBuilder().setCustomId(`sorteio:editar_vencedores:${interactionId}`).setLabel("Vencedores").setStyle(ButtonStyle.Secondary).setEmoji("🏆")
    );
    
    const editRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sorteio:editar_aparencia:${interactionId}`).setLabel("Aparência").setStyle(ButtonStyle.Secondary).setEmoji("🎨"),
        new ButtonBuilder().setCustomId(`sorteio:editar_requisitos:${interactionId}`).setLabel("Requisitos").setStyle(ButtonStyle.Secondary).setEmoji("🔒"),
        new ButtonBuilder().setCustomId(`sorteio:definir_ganhador:${interactionId}`).setLabel("Definir Ganhador").setStyle(ButtonStyle.Primary).setEmoji("👑")
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sorteio:iniciar:${interactionId}`).setLabel("Iniciar Sorteio").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sorteio:cancelar:${interactionId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger)
    );

    return { embeds: [configEmbed, previewEmbed], components: [channelSelectRow, editRow1, editRow2, actionRow] };
}


async function finalizarSorteio(client, messageId, sorteioOverride = null) {
    const sorteio = sorteioOverride || sorteiosAtivos.get(messageId);
    if (!sorteio) return;

    const canal = await client.channels.fetch(sorteio.channelId).catch(() => null);
    if (!canal) {
        db.finalizeSorteioInDb(messageId);
        sorteiosAtivos.delete(messageId);
        return;
    }
    const msgSorteio = await canal.messages.fetch(sorteio.messageId).catch(() => null);
    if (!msgSorteio) return;

    let ganhadores = [];
    if (sorteio.ganhadorForcado && !sorteio.isReroll) {
        ganhadores.push(sorteio.ganhadorForcado);
    } else {
        const listaParticipantes = Array.from(sorteio.participantes);
        if (listaParticipantes.length > 0) {
            for (let i = 0; i < sorteio.vencedores && listaParticipantes.length > 0; i++) {
                const randomIndex = Math.floor(Math.random() * listaParticipantes.length);
                ganhadores.push(listaParticipantes.splice(randomIndex, 1)[0]);
            }
        }
    }

    let embedFinal;
    if (ganhadores.length > 0) {
        const textoGanhadores = ganhadores.map(id => `<@${id}>`).join(', ');
        embedFinal = new EmbedBuilder().setColor('#8a00ff').setTitle(`🏆 Sorteio de "${sorteio.premio}" Finalizado!`).setDescription("O sorteio chegou ao fim! Confira abaixo o(s) grande(s) sortudo(s):").addFields({ name: '🎉 Vencedor(es)', value: textoGanhadores, inline: false }, { name: '👥 Participantes', value: `${sorteio.participantes.size} pessoas`, inline: true }, { name: 'Criado por', value: `<@${sorteio.autor.id}>`, inline: true }).setFooter({ text: "Parabéns aos vencedores!", iconURL: client.user.displayAvatarURL() }).setTimestamp();
        try { const winnerUser = await client.users.fetch(ganhadores[0]); embedFinal.setThumbnail(winnerUser.displayAvatarURL()); } catch {}
        await canal.send({ content: `Parabéns ${textoGanhadores}! Vocês ganharam o sorteio de **${sorteio.premio}**!` });
    } else {
        embedFinal = new EmbedBuilder().setColor('#666666').setTitle(`😐 Sorteio de "${sorteio.premio}" Finalizado`).setDescription("O sorteio terminou, mas infelizmente ninguém participou desta vez.").addFields({ name: '👥 Participantes', value: '0 pessoas', inline: true }, { name: 'Criado por', value: `<@${sorteio.autor.id}>`, inline: true }).setFooter({ text: "Mais sorte na próxima!", iconURL: client.user.displayAvatarURL() }).setTimestamp();
    }
    await msgSorteio.edit({ embeds: [embedFinal], components: [] });

    if (!sorteio.isReroll) {
        db.finalizeSorteioInDb(messageId);
        sorteiosAtivos.delete(messageId);
    }
}

async function atualizarEmbedContador(client, messageId) {
    const sorteio = sorteiosAtivos.get(messageId);
    if (!sorteio) return;
    try {
        const canal = await client.channels.fetch(sorteio.channelId);
        const msgSorteio = await canal.messages.fetch(sorteio.messageId);
        const embedOriginal = msgSorteio.embeds[0];
        const embedAtualizada = EmbedBuilder.from(embedOriginal);
        const campos = (embedOriginal.fields || []).filter(f => !f.name.includes('Participantes'));
        campos.push({ name: '👥 Participantes', value: `**${sorteio.participantes.size}**` });
        embedAtualizada.setFields(campos);
        await msgSorteio.edit({ embeds: [embedAtualizada] });
    } catch (err) {
        console.error("Falha ao atualizar contador (msg pode ter sido deletada):", err);
        db.finalizeSorteioInDb(messageId);
        sorteiosAtivos.delete(messageId);
    }
}

async function carregarSorteiosAtivos(client) {
    console.log('Carregando sorteios ativos do banco de dados...');
    const sorteios = db.fetchAllActiveSorteios();

    for (const sorteio of sorteios) {
        const agora = Date.now();
        const tempoRestante = sorteio.timestampFim - agora;

        try {
            sorteio.autor = await client.users.fetch(sorteio.autorId);
        } catch(e) {
            console.error(`Não foi possível encontrar o autor com ID ${sorteio.autorId} para o sorteio ${sorteio.messageId}. Pulando...`, e);
            continue;
        }
        
        sorteiosAtivos.set(sorteio.messageId, sorteio);

        if (tempoRestante <= 0) {
            console.log(`Sorteio ${sorteio.messageId} finalizado offline. Processando agora...`);
            finalizarSorteio(client, sorteio.messageId);
        } else {
            console.log(`Reagendando sorteio ${sorteio.messageId} para finalizar em ${Math.round(tempoRestante / 1000)}s.`);
            setTimeout(() => finalizarSorteio(client, sorteio.messageId), tempoRestante);
        }
    }
    console.log(`${sorteios.length} sorteios ativos carregados e reagendados.`);
}


module.exports = {
    carregarSorteiosAtivos,

    data: new SlashCommandBuilder()
        .setName("sorteio").setDescription("Cria e gerencia um sorteio no servidor.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('criar').setDescription('Cria um novo sorteio interativo.'))
        .addSubcommand(sub => sub.setName('reroll').setDescription('Sorteia um novo ganhador para um sorteio.').addStringOption(opt => opt.setName('id_da_mensagem').setDescription('O ID da mensagem do sorteio finalizado.').setRequired(true))),

    async execute(interaction) {
        const subcomando = interaction.options.getSubcommand();
        if (subcomando === 'criar') {
            const configSorteio = {
                premio: "Clique no botão 'Prêmio' para editar!", descricao: "Clique no botão 🎉 para participar!",
                duracao: "10m", vencedores: 1, cor: '#8a00ff',
                thumbnail: interaction.guild.iconURL(), footer: `Sorteio criado por ${interaction.user.username}`,
                requiredRoleId: null, autor: interaction.user, participantes: new Set(),
                ganhadorForcado: null, channel: interaction.channel, guildId: interaction.guild.id,
            };
            sorteiosEmAndamento.set(interaction.id, configSorteio);
            const painel = criarPainelConfigSorteio(configSorteio, interaction.id);
            await interaction.reply({ ...painel, ephemeral: true });
        }
        if (subcomando === 'reroll') {
            await interaction.deferReply({ ephemeral: true });
            const messageId = interaction.options.getString('id_da_mensagem');
            
            const sorteioParaReroll = db.fetchSorteio(messageId);
            if (!sorteioParaReroll) {
                return interaction.editReply({ content: "Não encontrei os dados deste sorteio no banco de dados. Verifique o ID." });
            }

            try {
                sorteioParaReroll.autor = await interaction.client.users.fetch(sorteioParaReroll.autorId);
            } catch {
                return interaction.editReply({ content: "Não foi possível encontrar o autor original do sorteio." });
            }

            sorteioParaReroll.isReroll = true;
            await finalizarSorteio(interaction.client, messageId, sorteioParaReroll);
            await interaction.editReply({ content: "✅ Novo ganhador sorteado com sucesso!" });
        }
    },

    async handleButton(interaction) {
        const parts = interaction.customId.split(':');
        const actionType = parts[0];

        if (actionType === 'participar_sorteio') {
            const sorteioId = parts[1];
            const sorteio = sorteiosAtivos.get(sorteioId);
            if (!sorteio) return interaction.reply({ content: "Este sorteio não está mais ativo.", ephemeral: true });

            if (sorteio.requiredRoleId && !interaction.member.roles.cache.has(sorteio.requiredRoleId)) {
                return interaction.reply({ content: `❌ Você não possui o cargo <@&${sorteio.requiredRoleId}> necessário.`, ephemeral: true });
            }

            let replyMessage;
            if (sorteio.participantes.has(interaction.user.id)) {
                sorteio.participantes.delete(interaction.user.id);
                replyMessage = "Você removeu sua participação no sorteio.";
            } else {
                sorteio.participantes.add(interaction.user.id);
                replyMessage = "✅ Participação confirmada! Boa sorte!";
            }

            db.updateSorteioParticipantes(sorteioId, sorteio.participantes);

            await interaction.reply({ content: replyMessage, ephemeral: true });
            await atualizarEmbedContador(interaction.client, sorteioId);
            return;
        }

        if (actionType === 'sorteio') {
            const [, action, interactionId] = parts;
            const config = sorteiosEmAndamento.get(interactionId);
            if (!config) return interaction.update({ content: "Este painel de criação expirou.", embeds: [], components: [] }).catch(() => {});

            if (action === 'iniciar') {
                const duracaoMs = parseDuration(config.duracao);
                if (duracaoMs <= 0) return interaction.update({ content: "Duração inválida.", embeds: [], components: [] });
                await interaction.update({ content: "Iniciando o sorteio...", embeds: [], components: [] });

                const dataFim = new Date(Date.now() + duracaoMs);
                const timestampFim = Math.floor(dataFim.getTime() / 1000);
                
                const sorteioEmbed = new EmbedBuilder().setColor(config.cor).setTitle(config.premio).setThumbnail(config.thumbnail)
                    .setDescription(`${config.descricao}\n\n**Sorteio termina:** <t:${timestampFim}:R> (<t:${timestampFim}:F>)`).setFooter({ text: config.footer, iconURL: config.autor.displayAvatarURL() }).setTimestamp(dataFim).addFields({ name: '👥 Participantes', value: `**0**` });
                
                const mensagemSorteio = await config.channel.send({ embeds: [sorteioEmbed] });
                const sorteioRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`participar_sorteio:${mensagemSorteio.id}`).setLabel("Participar").setStyle(ButtonStyle.Success).setEmoji("🎉"));
                await mensagemSorteio.edit({ components: [sorteioRow] });

                const sorteioData = {
                    ...config,
                    messageId: mensagemSorteio.id,
                    channelId: config.channel.id,
                    timestampFim: dataFim.getTime(),
                };
                
                sorteiosAtivos.set(mensagemSorteio.id, sorteioData);
                db.saveSorteio(sorteioData);

                sorteiosEmAndamento.delete(interactionId);
                setTimeout(() => finalizarSorteio(interaction.client, mensagemSorteio.id), duracaoMs);
                return;
            }
             if (action === 'cancelar') {
                sorteiosEmAndamento.delete(interactionId);
                return interaction.update({ content: "Criação de sorteio cancelada.", embeds: [], components: [] });
            }
            
            let modal;
            switch(action) {
                case 'editar_premio': modal = new ModalBuilder().setCustomId(`modal:premio:${interactionId}`).setTitle("Editar Prêmio").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('premio').setLabel("Qual será o prêmio?").setStyle(TextInputStyle.Short).setValue(config.premio))); break;
                case 'editar_descricao': modal = new ModalBuilder().setCustomId(`modal:descricao:${interactionId}`).setTitle("Editar Descrição").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descricao').setLabel("Descrição do sorteio").setStyle(TextInputStyle.Paragraph).setValue(config.descricao))); break;
                case 'editar_duracao': modal = new ModalBuilder().setCustomId(`modal:duracao:${interactionId}`).setTitle("Editar Duração").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duracao').setLabel("Duração (ex: 10m, 1h, 2d)").setStyle(TextInputStyle.Short).setValue(config.duracao))); break;
                case 'editar_vencedores': modal = new ModalBuilder().setCustomId(`modal:vencedores:${interactionId}`).setTitle("Editar Vencedores").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('vencedores').setLabel("Quantos vencedores?").setStyle(TextInputStyle.Short).setValue(String(config.vencedores)))); break;
                case 'editar_aparencia':
                    modal = new ModalBuilder().setCustomId(`modal:aparencia:${interactionId}`).setTitle("Editar Aparência");
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cor').setLabel("Cor da embed (código HEX)").setStyle(TextInputStyle.Short).setValue(config.cor).setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('thumbnail').setLabel("URL da imagem do canto (thumbnail)").setStyle(TextInputStyle.Short).setValue(config.thumbnail || '').setRequired(false)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('footer').setLabel("Texto do rodapé").setStyle(TextInputStyle.Short).setValue(config.footer).setRequired(false))
                    );
                    break;
                case 'editar_requisitos': modal = new ModalBuilder().setCustomId(`modal:requisitos:${interactionId}`).setTitle("Editar Requisitos").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('requiredRoleId').setLabel("ID do cargo obrigatório").setStyle(TextInputStyle.Short).setValue(config.requiredRoleId || '').setRequired(false))); break;
                case 'definir_ganhador': modal = new ModalBuilder().setCustomId(`modal:ganhador:${interactionId}`).setTitle("Definir Ganhador Manualmente").addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ganhador_id').setLabel("ID do Usuário que deve ganhar").setStyle(TextInputStyle.Short).setValue(config.ganhadorForcado || '').setRequired(false))); break;
            }
            if(modal) await interaction.showModal(modal);
        }
    },

    async handleChannelSelect(interaction) {
        const parts = interaction.customId.split(':');
        if (parts[0] !== 'sorteio' || parts[1] !== 'select_channel') return;
        const [, , interactionId] = parts;
        const config = sorteiosEmAndamento.get(interactionId);
        if (!config) return interaction.update({ content: "Este painel de criação expirou.", embeds: [], components: [] }).catch(() => {});
        const channelId = interaction.values[0];
        const channel = await interaction.client.channels.fetch(channelId);
        if (!channel || channel.type !== ChannelType.GuildText) return interaction.reply({ content: "Canal inválido.", ephemeral: true });
        config.channel = channel;
        const painelAtualizado = criarPainelConfigSorteio(config, interactionId);
        await interaction.update({ ...painelAtualizado });
    },
    
    async handleModal(interaction) {
        const parts = interaction.customId.split(':');
        const [, modalAction, interactionId] = parts;
        const config = sorteiosEmAndamento.get(interactionId);
        if (!config) return;
        try {
            switch(modalAction) {
                case 'premio': config.premio = interaction.fields.getTextInputValue('premio'); break;
                case 'descricao': config.descricao = interaction.fields.getTextInputValue('descricao'); break;
                case 'duracao': config.duracao = interaction.fields.getTextInputValue('duracao'); break;
                case 'vencedores': config.vencedores = parseInt(interaction.fields.getTextInputValue('vencedores')) || 1; break;
                case 'aparencia':
                    config.cor = interaction.fields.getTextInputValue('cor') || '#8a00ff';
                    config.thumbnail = interaction.fields.getTextInputValue('thumbnail') || null;
                    config.footer = interaction.fields.getTextInputValue('footer') || `Sorteio por: ${interaction.user.username}`;
                    break;
                case 'requisitos': config.requiredRoleId = interaction.fields.getTextInputValue('requiredRoleId').trim() || null; break;
                case 'ganhador': config.ganhadorForcado = interaction.fields.getTextInputValue('ganhador_id').trim() || null; break;
            }
            const painelAtualizado = criarPainelConfigSorteio(config, interactionId);
            await interaction.update({ ...painelAtualizado });
        } catch (err) { 
            console.error("Erro ao processar modal de sorteio", err); 
        }
    }
};