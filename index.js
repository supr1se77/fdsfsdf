// Módulos principais do Discord e Node.js
const { Client, Collection, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

// Módulos para sistemas específicos
const { QuickDB } = require('quick.db'); // Para o sistema AFK
const { initDb } = require('./utils/database');
const { carregarSorteiosAtivos } = require('./commands/giveway');
const comandosEstoque = require('./commands/estoque'); 
const moment = require('moment');
require('moment-duration-format');

// Inicialização dos bancos de dados
const db = new QuickDB(); // Banco de dados para o AFK

// Configuração do Cliente (Bot)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
});

client.commands = new Collection();

// Carregadores de Handlers
require('./handler/commandHandler')(client);

// ===================================================================================
// EVENTO 'ready': EXECUTADO QUANDO O BOT FICA ONLINE
// ===================================================================================
client.once('ready', async () => {
    console.log(`🔥 BOT ONLINE COMO ${client.user.tag}`);
    
    initDb();
    await carregarSorteiosAtivos(client);
    console.log('✅ Sistemas de Sorteio e AFK prontos.');

    // Rotação de status
    const statusList = [
        { name: 'Consultando BINs', type: ActivityType.Watching },
        { name: 'Adicionando estoque', type: ActivityType.Playing },
        { name: 'Verificando saldo de cartões', type: ActivityType.Watching },
        { name: 'Garantindo qualidade', type: ActivityType.Playing },
    ];
    let i = 0;
    setInterval(() => {
        const status = statusList[i % statusList.length];
        client.user.setActivity(status.name, { type: status.type });
        i++;
    }, 15000); 
});

// ===================================================================================
// ROTEADOR DE INTERAÇÕES (COM A LÓGICA DO LOGGER ADICIONADA)
// ===================================================================================
client.on('interactionCreate', async interaction => {
    // Primeiro, lida com comandos de barra (/)
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command && command.execute) {
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Erro ao executar o comando '${interaction.commandName}':`, error);
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
                }
            }
        }
        return;
    }

    // Se não tiver customId, ignora
    if (!interaction.customId) return;

    // --- NOVA LÓGICA PARA OS BOTÕES DO LOGGER ---
    // Verifica se é um botão de log e o direciona para o handler correto
    if (interaction.isButton() && interaction.customId.startsWith('log:')) {
        const logger = require('./utils/logger');
        if (logger.handleLogButton) {
            try {
                return await logger.handleLogButton(interaction);
            } catch (error) {
                 console.error(`Erro ao processar o botão de log '${interaction.customId}':`, error);
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Ocorreu um erro ao processar esta ação do log.', ephemeral: true });
                 }
            }
        }
    }
    
    // Roteador principal para componentes de COMANDOS (painel:, estoque:, etc.)
    const [commandName] = interaction.customId.split(':');
    const command = client.commands.get(commandName);

    if (command) {
        try {
            if (interaction.isButton() && command.handleButton) {
                await command.handleButton(interaction);
            } else if (interaction.isStringSelectMenu() && command.handleSelectMenu) {
                await command.handleSelectMenu(interaction);
            } else if (interaction.isChannelSelectMenu() && command.handleChannelSelect) {
                await command.handleChannelSelect(interaction);
            } else if (interaction.isModalSubmit() && command.handleModal) {
                await command.handleModal(interaction);
            }
        } catch (error) {
            console.error(`Erro ao processar componente para o comando '${commandName}':`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Ocorreu um erro ao processar esta ação.', ephemeral: true });
            }
        }
    }
});


// ===================================================================================
// LISTENER DE MENSAGEM (AFK + IMPORTAÇÃO DE ESTOQUE)
// ===================================================================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- LÓGICA DO SISTEMA AFK ---
    const afkData = await db.get(`afk_${message.author.id}`);
    if (afkData) {
        await db.delete(`afk_${message.author.id}`);
        const afkStarted = moment(afkData.timestamp * 1000);
        const now = moment();
        const duration = moment.duration(now.diff(afkStarted)).format("d[d], h[h], m[m], s[s]");
        const sentMessage = await message.reply({ embeds: [new EmbedBuilder().setColor('#8a00ff').setTitle(`👋 Bem-vindo(a) de volta, ${message.author.username}!`).setDescription(`Seu status AFK foi removido. Você esteve ausente por **${duration}**.`).setTimestamp()] });
        setTimeout(() => sentMessage.delete().catch(() => {}), 15000);
    }

    const mentionedUsers = message.mentions.users;
    if (mentionedUsers.size > 0) {
        mentionedUsers.forEach(async (mentionedUser) => {
            const mentionedAfkData = await db.get(`afk_${mentionedUser.id}`);
            if (mentionedAfkData) {
                const afkResponseEmbed = new EmbedBuilder().setColor('#8a00ff').setAuthor({ name: `${mentionedUser.username} está ausente`, iconURL: mentionedUser.displayAvatarURL() }).setDescription(`**Motivo:**\n\`\`\`${mentionedAfkData.motivo}\`\`\``).addFields({ name: 'Ausente desde', value: `<t:${mentionedAfkData.timestamp}:R>` }).setFooter({ text: 'Ele(a) será notificado(a) da sua menção quando retornar.' });
                message.reply({ embeds: [afkResponseEmbed] });
            }
        });
    }

    // --- LÓGICA DE IMPORTAÇÃO DE ESTOQUE ---
    if (message.attachments.size > 0 && message.member.permissions.has('ManageGuild')) {
        const attachment = message.attachments.first();
        const nome = attachment.name.toLowerCase();
        if (nome.endsWith(".txt") || nome.endsWith(".json")) {
            // A função handleArquivoImportado já tem o log de admin dentro dela
            await comandosEstoque.handleArquivoImportado(message);
        }
    }
});

client.login(config.token);